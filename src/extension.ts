'use strict';

import * as path from 'path';
import * as child_process from 'child_process';

import * as ajv from 'ajv';
import * as vscode from 'vscode';

import * as util from './util';
import * as expander from './expand';
import * as diagnostics from './diagnostics';
import * as status from './status';

interface TaskConfiguration
{
    name: string;
    program: string;
    args: string[];
    cwd: string;
}

interface Configuration
{
    solution: string;
    verbosity: string;
    variables: Map<string,string>;
    env: Map<string, string>;
    preBuildTasks: TaskConfiguration[];
    postBuildTasks: TaskConfiguration[];
    debugConfigurations: TaskConfiguration[];
    buildConfigurations: string[];
    platformConfigurations: string[];
}

const DefaultConfiguration : Configuration =
{
    solution: null,
    verbosity: "minimal",
    variables: new Map<string, string>(),
    env: new Map<string, string>(),
    preBuildTasks: [],
    postBuildTasks: [],
    debugConfigurations: [],
    buildConfigurations: ["Debug", "Release"],
    platformConfigurations: []
};

enum BuildState
{
    IDLE,
    STARTED,
    KILLED
}

interface SpawnOptions
{
    program: string;
    args: string[];
    cwd?: string;
    env?: Map<string, string>;

    channel: vscode.OutputChannel;
    initChannel?: boolean;

    message?: string;
    parseOutput?: boolean;
}

function expand(e:expander.Expander, opts: SpawnOptions) : SpawnOptions
{
    return {
        program: e.expand(opts.program),
        args: e.expand(opts.args),
        cwd: e.expand(opts.cwd),
        env: e.expand(opts.env),

        channel: opts.channel,
        initChannel: opts.initChannel,

        message: e.expand(opts.message),
        parseOutput: opts.parseOutput
    };
}

class Extension
{
    private schemaPath =
        path.join(this.context.extensionPath, "schemas", "msbuild-tools-schema.json");

    private readonly configFilePath :string =
        path.join(vscode.workspace.rootPath, ".vscode", "msbuild-tools.json");

    private readonly statusBar =
        new status.StatusBar();

    private diag : vscode.DiagnosticCollection =
        vscode.languages.createDiagnosticCollection('msbuild-tools');

    private buildOutputChannel =
        vscode.window.createOutputChannel("msbuild-tools build");

    private runOutputChannel =
        vscode.window.createOutputChannel("msbuild-tools run");

    private config : Configuration = null;

    private addDisposable(d: vscode.Disposable) : void
    {
        this.context.subscriptions.push(d);
    }

    public constructor(private context: vscode.ExtensionContext)
    {
        const commandNames = [
            'build',
            'clean',
            'debug',
            'run',
            'kill',
            'selectBuildConfiguration',
            'selectPlatformConfiguration',
            'selectDebugConfiguration',
            'openVisualStudio'
        ];

        for( let name of commandNames)
        {
            context.subscriptions.push( vscode.commands.registerCommand(`msbuild-tools.${name}`, ()=>
            {
                if( !vscode.workspace.registerTextDocumentContentProvider )
                {
                    vscode.window.showErrorMessage('Extension [msbuild-tools] requires an open folder');
                    return;
                }
                else if( !this.config )
                {
                    vscode.window.showErrorMessage('Extension [msbuild-tools] requires a correctly formatted .vscode/msbuild-tools.json');
                    return;
                }
                else
                {
                    this[name]();
                }
            }));
        }

        const configWatcher = vscode.workspace.createFileSystemWatcher(this.configFilePath);
        this.addDisposable( configWatcher );

        this.addDisposable( configWatcher.onDidCreate((uri : vscode.Uri) => this.reloadConfig(uri.fsPath)) );
        this.addDisposable( configWatcher.onDidChange((uri : vscode.Uri) => this.reloadConfig(uri.fsPath)) );
        this.addDisposable( configWatcher.onDidDelete((uri : vscode.Uri) => this.reloadConfig(uri.fsPath)) );

        this.addDisposable( this.statusBar );
        this.addDisposable( this.diag );
        this.addDisposable( this.buildOutputChannel );
        this.addDisposable( this.runOutputChannel );
    }

    private validateConfig : ajv.ValidateFunction;

    public async setup()
    {
        this.validateConfig = await util.readSchema(this.schemaPath);
        await this.reloadConfig(this.configFilePath);
    }

    private async reloadConfig(fileName: string)
    {
        try
        {
            let config = await util.readJSON(fileName, this.validateConfig);

            if( config.variables )
            {
                config.variables = new Map<string, string>(util.entries(config.variables));
            }

            if( config.env )
            {
                config.env = new Map<string, string>(util.entries(config.env));
            }

            this.config = util.merge(DefaultConfiguration, config);
        }
        catch(e)
        {
            this.config = null;
            vscode.window.showErrorMessage(`[msbuild-tools]: ${e.message}`);
        }

        this.updateStatus();
    }

    private getState<T>(
        key: string,
        legal:(val:T)=>boolean,
        otherwise:(key:string)=>T,
        valid:()=>boolean=()=>true)
    {
        if( !valid() )
        {
            return null;
        }

        let val = this.context.workspaceState.get<T>(key);

        if( !val || !legal(val) )
        {
            val = otherwise(key);
            this.context.workspaceState.update(key, val);
        }

        return val;
    }

    get buildConfig() : string
    {
        return this.getState<string>(
            "buildConfig",
            (val:string) => this.config.buildConfigurations.indexOf(val)!==-1,
            (key:string) => this.config.buildConfigurations[0]
        );
    }

    set buildConfig(config: string)
    {
        this.context.workspaceState.update("buildConfig", config);
        this.updateStatus();
    }

    get platformConfig() : string
    {
        return this.getState<string>(
            "platformConfig",
            (val:string) => this.config.platformConfigurations.indexOf(val)!==-1,
            (key:string) => this.config.platformConfigurations[0],
            () => this.config.platformConfigurations.length > 0
        );
    }

    set platformConfig(config: string)
    {
        this.context.workspaceState.update("platformConfig", config);
        this.updateStatus();
    }

    get debugConfigName() : string
    {
        return this.getState<string>(
            "debugConfig",
            (val:string) => this.config.debugConfigurations.some( (t) => t.name==val ),
            (key:string) => this.config.debugConfigurations[0].name,
            () => this.config.debugConfigurations.length > 0
        );
    }

    set debugConfigName(config: string)
    {
        this.context.workspaceState.update("debugConfig", config);
        this.updateStatus();
    }

    get debugConfig() : TaskConfiguration
    {
        let name = this.debugConfigName;
        return this.config.debugConfigurations.find( dc => dc.name===name );
    }

    private updateStatus()
    {
        if( this.config )
        {
            this.statusBar.update(this.buildConfig, this.debugConfigName, this.platformConfig);
        }
        else
        {
            this.statusBar.hide();
        }
    }

    private expander() : expander.Expander
    {
        const M = new Map<string, string>();

        M.set('workspaceRoot', vscode.workspace.rootPath);
        M.set('buildRoot', '${workspaceRoot}/build');
        M.set('buildConfig', this.buildConfig);
        M.set('platformConfig', this.platformConfig);
        M.set('buildPath', '${buildRoot}/${buildConfig}');

        for( let [v, val] of this.config.variables )
        {
            M.set(v, val);
        }

        return new expander.Expander(M);
    }

    private buildState : BuildState = BuildState.IDLE;
    private buildProcess : child_process.ChildProcess = null;

    private spawn(args:SpawnOptions) : child_process.ChildProcess
    {
        let proc = util.spawn(args.program, args.args, args.cwd, args.env);
        this.buildProcess = proc;

        util.redirectToChannel(proc, args.channel, args.initChannel);

        if( args.parseOutput )
        {
            diagnostics.parseOutput(this.diag, proc.stdout);
        }

        if( args.message )
        {
            args.channel.appendLine(`[msbuild-tools]: ${args.message}`);
        }

        args.channel.appendLine(`[msbuild-tools]: Running: ${args.program} ${args.args.join(" ")}`);

        if( args.cwd )
        {
            args.channel.appendLine(`[msbuild-tools]: Working Directory: ${args.cwd}`);
        }

        proc.on('terminated', (message:string) =>
        {
            this.buildProcess = null;
            args.channel.appendLine(`[msbuild-tools]: ${message}`);
        });

        return proc;
    }

    private async asyncSpawn(args:SpawnOptions)
    {
        return new Promise<child_process.ChildProcess>((resolve, reject) =>
        {
            let proc = this.spawn(args);

            proc.on('fail', (message:string) =>
            {
                reject(new Error(message));
            });

            proc.on('success', (message:string) =>
            {
                resolve(proc);
            });
        });
    }

    private async asyncSpawnMSBuild(e:expander.Expander, extraArgs:string[]) : Promise<child_process.ChildProcess>
    {
        let args = [
            this.config.solution,
            "/m",
            "/nologo",
            `/verbosity:${this.config.verbosity}`,
            `/p:Configuration=${this.buildConfig}`,
        ];

        if( this.platformConfig !== null )
        {
            args.push(`/p:Platform=${this.platformConfig}`);
        }

        let opts: SpawnOptions= {
            program: "${MSBUILD}",
            args: args.concat(extraArgs),
            env: this.config.env,
            channel: this.buildOutputChannel,
            initChannel: false,
            parseOutput: true
        };

        return await this.asyncSpawn(expand(e, opts));
    }

    private async asyncSpawnTask(e:expander.Expander, task: TaskConfiguration) : Promise<child_process.ChildProcess>
    {
        let args: SpawnOptions =
        {
            program: task.program,
            args: task.args,
            env: this.config.env,
            cwd: task.cwd,
            channel: this.buildOutputChannel,
            initChannel: false,
            message: `Running Task: ${task.name}`
        };

        return await this.asyncSpawn(expand(e, args));
    }

    private async wrapBuild<T>( f: () => T ) : Promise<T|null>
    {
        vscode.workspace.saveAll();

        if( this.buildState !== BuildState.IDLE )
        {
            return null;
        }

        this.buildState = BuildState.STARTED;

        try
        {
            return await f();
        }
        catch(e)
        {
        }
        finally
        {
            this.buildState = BuildState.IDLE;
        }
    }

    private async asyncBuild(e:expander.Expander)
    {
        this.buildOutputChannel.clear();
        this.buildOutputChannel.show();

        for( let task of this.config.preBuildTasks )
        {
            await this.asyncSpawnTask(e, task);
        }

        await this.asyncSpawnMSBuild(e, []);

        for( let task of this.config.postBuildTasks )
        {
            await this.asyncSpawnTask(e, task);
        }
    }

    public async build()
    {
        const e = this.expander();

        await this.wrapBuild( async () =>
        {
            await this.asyncBuild(e);
        });
    }

    public async clean()
    {
        const e = this.expander();

        await this.wrapBuild( async () =>
        {
            await this.asyncSpawnMSBuild(e, [ '/t:Clean' ]);
        });
    }

    public async debug()
    {
        await this.wrapBuild( async () =>
        {
            const e = this.expander();

            await this.asyncBuild(e);

            const dc = this.debugConfig;

            const config = {
                name: e.expand(dc.name),
                type: "cppvsdbg",
                request: "launch",
                program:  e.expand(dc.program),
                args:  e.expand(dc.args),
                cwd:  e.expand(dc.cwd),
                env: util.to_object(e.expand(this.config.env)),
                stopAtEntry: false,
                externalConsole: false
            };

            await vscode.debug.startDebugging(vscode.workspace.workspaceFolders![0], config);
        });
    }

    public async run()
    {
        await this.wrapBuild( async () =>
        {
            const e = this.expander();

            await this.asyncBuild(e);

            const dc = this.debugConfig;
            let proc = util.spawn(e.expand(dc.program), e.expand(dc.args), e.expand(dc.cwd), e.expand(this.config.env));

            util.redirectToChannel(proc, this.runOutputChannel, true);

            proc.on('terminated', (message:string) =>
            {
                this.runOutputChannel.append(`[msbuild-tools] ${message}`);
            });
        });
    }

    public kill()
    {
        if( this.buildState === BuildState.STARTED && this.buildProcess !== null )
        {
            this.buildState = BuildState.KILLED;
            this.buildProcess.kill("SIGTERM");
        }
    }

    public async selectBuildConfiguration()
    {
        let choice = await vscode.window.showQuickPick(this.config.buildConfigurations);

        if( choice )
        {
            this.buildConfig = choice;
        }
    }

    public async selectPlatformConfiguration()
    {
        let choice = await vscode.window.showQuickPick(this.config.platformConfigurations);

        if( choice )
        {
            this.platformConfig = choice;
        }
    }

    public async selectDebugConfiguration()
    {
        let items = this.config.debugConfigurations.map( dc => dc.name );

        if ( items.length > 0 )
        {
            let choice = await vscode.window.showQuickPick(items);

            if( choice )
            {
                this.debugConfigName = choice;
            }
        }
    }

    public openVisualStudio()
    {
        const e = this.expander();
        util.spawn(e.expand('${DEVENV}'), [e.expand(this.config.solution)], null, e.expand(this.config.env));
    }
}

export async function activate(context: vscode.ExtensionContext)
{
    let ext = new Extension(context);
    await ext.setup();
}

export function deactivate()
{
}

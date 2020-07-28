import * as vscode from 'vscode';
import { platform } from 'os';

export class StatusBar
    implements vscode.Disposable
{
    private buildStatusItem =
        vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5.04);

    private buildConfigStatusItem =
        vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5.03);

    private buildPlatformStatusItem =
        vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5.03);

    private buildTargetStatusItem =
        vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5.03);

    private debugStatusItem =
        vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5.021);

    private runStatusItem =
        vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5.02);

    private debugConfigStatusItem =
        vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5.01);

    private killStatusItem =
        vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5.00);

    constructor()
    {
        this.buildStatusItem.command = "msbuild-tools.build";
        this.buildStatusItem.tooltip = "Click to build the project";
        this.buildStatusItem.text = "$(gear) msbuild:";

        this.buildConfigStatusItem.command = "msbuild-tools.selectBuildConfiguration";
        this.buildConfigStatusItem.tooltip = "Click to select the build configuration";

        this.buildPlatformStatusItem.command = "msbuild-tools.selectPlatformConfiguration";
        this.buildPlatformStatusItem.tooltip = "Click to select platform";

        this.buildTargetStatusItem.command = "msbuild-tools.selectTargetConfiguration";
        this.buildTargetStatusItem.tooltip = "Click to select target";

        this.debugStatusItem.command = "msbuild-tools.debug";
        this.debugStatusItem.tooltip = "Click to launch the debugger for the selected debug configuration";
        this.debugStatusItem.text = "$(bug)";

        this.runStatusItem.command = "msbuild-tools.run";
        this.runStatusItem.tooltip = "Click to run (without debugging) the selected debug configuration";
        this.runStatusItem.text = "$(triangle-right)";

        this.debugConfigStatusItem.command = "msbuild-tools.selectDebugConfiguration";
        this.debugConfigStatusItem.tooltip = "Click to select the debug configuration";

        this.killStatusItem.command = "msbuild-tools.kill";
        this.killStatusItem.tooltip = "Click to kill current build";
        this.killStatusItem.text = "$(x)";
    }

    public forAllItems(f: (item: vscode.StatusBarItem) => void)
    {
        f(this.buildStatusItem);
        f(this.buildConfigStatusItem);
        f(this.buildPlatformStatusItem);
        f(this.buildTargetStatusItem);
        f(this.debugStatusItem);
        f(this.runStatusItem);
        f(this.debugConfigStatusItem);
        f(this.killStatusItem);
    }

    public dispose()
    {
        this.forAllItems(i => i.dispose());
    }

    public show()
    {
        this.forAllItems(i => i.show());
    }

    public hide()
    {
        this.forAllItems(i => i.hide());
    }

    public update(buildConfig: string, debugConfig: string, platformConfig: string, targetConfig: string)
    {
        this.buildConfigStatusItem.text = buildConfig;
        this.buildPlatformStatusItem.text = platformConfig;
        this.buildTargetStatusItem.text = targetConfig;
        this.debugConfigStatusItem.text = debugConfig;

        this.forAllItems((i) =>
        {
            if(debugConfig === null && (i === this.debugStatusItem || i === this.runStatusItem || i === this.debugConfigStatusItem))
            {
                i.hide();
            }
            else if(platformConfig === null && i === this.buildPlatformStatusItem)
            {
                i.hide();
            }
            else if(targetConfig === null && i === this.buildTargetStatusItem)
            {
                i.hide();
            }
            else
            {
                i.show();
            }
        });
    }
}

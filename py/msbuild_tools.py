import os
import json
import subprocess

import click


class expander(object):
    
    def __init__(self, M):

        self.M = { '${%s}'%k : v for k, v in M.iteritems() }
        self.topological_order = []

        visiting = set()
        visited = set()

        level = [0]

        def visit(var):
           
            if var in visiting:
                raise RuntimeError('cyclic variable definition')
            
            if var in visited:
                return

            visiting.add(var)
            visited.add(var)

            value = self.M[var]

            for key in self.M:
                if value.find(key) != -1:
                    visit(key)

            visiting.remove(var)
            self.topological_order.append(var)

        for key in self.M:
            visit(key)

        self.topological_order = list(reversed(self.topological_order))


    def expand(self, x):
        
        if isinstance(x, list):
            return [ self.expand(s) for s in x ]

        if isinstance(x, dict):
            return { self.expand(k):self.expand(v) for k, v in x.iteritems() }

        for k in self.topological_order:
            x = x.replace(k, self.M[k])
        
        return x.encode('utf-8')


class project(object):

    def __init__(self, path, config):

        self.config = config
        self.path = path

        vars = {
            'buildConfig': config,
            'workspaceRoot': os.path.abspath(path),
            'buildRoot': r'${workspaceRoot}/build',
            'buildPath': r'${buildRoot}/${buildConfig}',
        }

        with open( os.path.join(path, '.vscode', 'msbuild-tools.json'), 'r' ) as fin:
            self.proj = json.load( fin )

        vars.update( self.proj['variables'] )

        self.e = expander(vars)

        self.env = self.proj.get('env')
        if self.env:
            e = dict(os.environ)
            for k, v in self.env.iteritems():
                e[ k.encode('utf-8') ] = v.encode('utf-8')
            self.env = e

    def task(self, name, cwd, program, args):
        print 'Running Task:', name
        subprocess.call(self.e.expand([program] + args), cwd=self.e.expand(cwd), env=self.env)

    def tasks(self, var):
        print 'Running: ', var
        for t in self.proj.get(var, []):
            self.task(t['name'], t['cwd'], t['program'], t['args'])

    def msbuild(self, *extra_args):
        args = [
            # 'cmd.exe', '-c', 'set'
            r'${MSBUILD}',
            self.proj['solution'],
            '/m',
            '/nologo',
            '/verbosity:{}'.format(self.proj.get('verbosity', 'minimal')),
            '/p:Configuration={}'.format(self.config),
        ] + list(extra_args)
        subprocess.call(self.e.expand(args), cwd=self.path, env=self.e.expand(self.env))

    def build(self):
        self.tasks('preBuildTasks')
        self.msbuild()
        self.tasks('postBuildTasks')

    def clean(self):
        self.msbuild('clean')


@click.group()
@click.option("--path", type=click.Path(), default=os.getcwd())
@click.option("--config", default='Debug')
@click.pass_context
def cli(ctx, path, config):
    ctx.ensure_object(dict)
    ctx.obj['proj'] = project(path, config)


@cli.command()
@click.pass_context
def build(ctx):
    ctx.obj['proj'].build()


@cli.command()
@click.pass_context
def clean(ctx):
    ctx.obj['proj'].clean()


if __name__ == "__main__":
    cli()

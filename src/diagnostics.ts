
import * as path from 'path';
import * as stream from 'stream';
import * as vscode from 'vscode';
import * as util from './util';

const Severity = {
    info: vscode.DiagnosticSeverity.Information,
    warning: vscode.DiagnosticSeverity.Warning,
    error: vscode.DiagnosticSeverity.Error
};

const MessageRegExp = /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\)\s*:\s+(error|warning|info)\s+(\w{1,2}\d+)\s*:\s*(.*)\[(.*)\]$/;

function parseLocation(value: string): vscode.Range
{
    let parts = value.split(',');
    let start_line = parseInt(parts[0]);

    if( parts.length == 1)
    {
        return new vscode.Range(start_line, 1, start_line, 1000);
    }

    let start_col = parseInt(parts[1]);

    if (parts.length < 3) 
    {
        return new vscode.Range(start_line, start_col, start_line, 1000);
    } 
    else
    {
        return new vscode.Range(start_line, start_col, parseInt(parts[2]), parseInt(parts[3]));
    }
}

export function parseOutput(diags:vscode.DiagnosticCollection, s:stream.Readable) : void
{
    util.splitLines(s);

    let messages = new Map<string, vscode.Diagnostic[]>();

    s.on('line', (line:string) => 
    {
        let m = MessageRegExp.exec(line.trim());

        if( m )
        {
            const file = m[1];
            const location = parseLocation(m[2]);
            const severity = Severity[m[3]];
            const code = m[4];
            const message = m[5];
            const vcxproj = m[6];

            const proj_dir = path.dirname(vcxproj);
            const abs_file = path.join(proj_dir, file);

            let d = new vscode.Diagnostic(
                location,
                `${code} : ${message} [${vcxproj}]`,
                severity
            );

            if( ! messages.has(abs_file) )
            {
                messages.set(abs_file, [d]);
                return;
            }

            messages.get(abs_file).push(d);
        }
    });

    s.on('end', () => 
    {
        diags.clear();

        for( let [fn, ds] of messages)
        {
            diags.set(vscode.Uri.file(fn), ds);
        }
    });
}

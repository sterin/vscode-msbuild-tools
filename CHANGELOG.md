# Change Log
All notable changes to the "vscode-msbuild-tools" extension will be documented in this file.

## 0.0.10
- Add support for specifying platform configuration (instead of whatever the default is) from msbuild-tools.json. Thanks to @Estivoo.
- Make the status bar items behave more reasonably when debug, or platform configurations are missing from msbuilt-tools.json.

## 0.0.9
- Add support for specifying build configuration (instead of the default Debug/Release) from msbuild-tools.json. Thanks to @ja-no.

## 0.0.8
- Fix debugging (switch to new `vscode.debug.startDebugging()`).
- Added a working example (see `example/helloworld`).

## 0.0.7
- Fix a bug where variables used in environment variables provided to Visual Studio were not expanded.

## 0.0.6
- Added an animated GIF demo in the README.

## 0.0.5
- Fix typo in schema file.

## 0.0.4
- Fixed parsing of compiler messages.

## 0.0.3
- Add an optional "verbosity" argument to config file
- Add /nologo argument to msbuild

## 0.0.2
- Added missing configuration file schema
- Make sure that post build tasks are not executed if the build fails or is killed.

## 0.0.1
- Initial release (a slight modification to vscode-msbuild-tools)

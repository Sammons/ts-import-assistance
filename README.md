# ts-imports README

This is the README for your extension "ts-imports". After writing up a brief description, we recommend including the following sections.

## Features

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: enable/disable this extension
* `myExtension.thing`: set to `blah` to do something

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

# 0.0.1 Snapshot release

TypeScript assistance with writing imports.

cmd + shift + p, then "Resolve and import symbol".

The extension command is `resolveMissingImportsForHighlighted`

This will search for symbols matching whatever you have highlighted, and then import them into the current file.
If nothing is highlighted, it makes a best guess using text before the cursor. 
This tool isn't very smart right now, it will blindly attempt to import things even if they exist in scope.


Cheers!

This software is utterly free and open, and the authors are not responsible for any consequences of its existence (MIT license).
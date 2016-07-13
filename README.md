TypeScript assistance with writing imports. Written with node.js development in mind.

cmd + shift + p, then type "Resolve and import symbol". This normally autocompletes just typing "res".

The extension command is `extension.resolveMissingImportsForHighlighted`, if you want to bind it to a hotkey, for example you could use the following in keybindings:


    {
        "key": "cmd+i", "command": "extension.resolveMissingImportsForHighlighted"
    }


This will search for symbols matching whatever you have highlighted, and then import them into the current file.

If nothing is highlighted, it makes a best guess using text around the cursor.

This tool isn't very smart; it will blindly attempt to import things even if they exist in scope.
On the flipside the source isn't that big and the heuristics it uses are relatively simple. 

Feel free to open issues or pull requests on Github.

Cheers!
Source [here](https://github.com/Sammons/ts-import-assistance)

This software is utterly free and open, and the authors are not responsible for any consequences of its existence (MIT license).

# 0.0.7

* Stop accepting more special characters

# 0.0.6

* [Symbol names are not found for import unless the cursor is positioned at the end of the name](https://github.com/Sammons/ts-import-assistance/issues/10)
    - Now will backtrack to try to find symbol
    - This also means that usages like `new ClassName().wat| <- cursor at the pipe` might work (assuming no params)
* [Imports incorrectly are added above /// <reference ... /> lines instead of below](https://github.com/Sammons/ts-import-assistance/issues/9)
    - This should work even if there are comments above the triple slashe ref
* Also run for all cursor locations; multiple cursor support.

# 0.0.5

* [For ../ paths, don't do ./../](https://github.com/Sammons/ts-import-assistance/issues/5)
* [Use forward-slash, not backslash, in module paths.](https://github.com/Sammons/ts-import-assistance/issues/6)
    - Thought this was taken care of, apparently `path.relative` will reintroduce backslashes on windows.
* move the readme overview to "above" the change log

# 0.0.4

* do not consider "<" or ">" part of symbols when guessing symbols to import.
* stop ignoring periods; fs.readFileSync (cursor here) will now try to look up "readFileSync" first instead of "fsreadFileSync"
* for core node modules do "import * as module from 'module'" when possible, e.g. fs
* for modules in typings do "import * as module from 'module'" when possible, e.g. using bluebird
* stop clobbering "use strict"
* updates to readme / packaging

# 0.0.3

* instead of importing `../node_modules/.../module_name/file`, import `module_name/file`
* stop caring if the file is dirty

# 0.0.2

packaging updates

# 0.0.1 Snapshot release
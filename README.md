# 0.0.1 Snapshot release

TypeScript assistance with writing imports.

cmd + shift + p, then "Resolve and import symbol".

The extension command is `resolveMissingImportsForHighlighted`

This will search for symbols matching whatever you have highlighted, and then import them into the current file.
If nothing is highlighted, it makes a best guess using text before the cursor. 
This tool isn't very smart right now, it will blindly attempt to import things even if they exist in scope.


Cheers!

This software is utterly free and open, and the authors are not responsible for any consequences of its existence (MIT license).
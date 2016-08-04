# Vash Static

## Description
Static HTML renderer for Razor templates, using the Vash library.

## Usage
Run `node _example` to see examples of each public function.

## API

### precompileTemplateCache
Precompiles a single vash template and passes the template's name and contents in the callback. Use this to create a template cache JSON file to load from.

#### Options
- {string} file - File path to the template.
- {boolean} debugMode (optional) - Production usage should pass false to keep file size down. Development should use true, for useful debugging info. Defaults to false.
- {string[]} dirTypes (optional) - List of types. This type will be searched for in the filePath and is expected to be a full directory name. If not given, only page type will be used.
- {string} modelsPath (optional) - File path to the combined models js file, which can prepend your templates to provide model data. If not given, no models will be added.

#### Callback
- 1st argument is a boolean for success/fail
- 2nd argument is an object containing template 'name' and 'contents' properties


### updateCache
Precompiles and updates an individual cached template. Can be used on a file watch.

#### Options
- {boolean} debugMode (optional) - Production usage should pass false to keep file size down. Development should use true, for useful debugging info. Defaults to false.
- {string} modelsPath (optional) - File path to the combined models js file, which can prepend your templates to provide model data. If not given, no models will be added.
- {string} type - Module type, such as 'pg', 'wg', 'glb'. Will default to page type.
- {string} tmplPath - File path to load template from.
- {string} cacheDest - Path to the JSON file containing the vash template cache.
- {string} contents (optional) - Optionally pass the contents of a template, which just saves an extra read from the file system. If your creating a Gulp plugin, you could get this from vinyl stream.
- {Function} cb (optional) - Optionally have a callback trigger, passing the success status and (if true) template name.


### renderPage
Renders a 'page' vash template by name, which should be stored in the cacheDest, with optional helpers.

#### Options
- {string} cacheDest - Path to the JSON file containing the vash template cache.
- {string} pgName - Name of the page module.
- {string[]} helpers (optional) - Array of paths to use as Vash helpers. Defaults will be used, unless overridden by name. Otherwise both lists will be used.


### setIgnoreComments
By default you can strip out all code between @*VASH_IGNORE_START*@ and @*VASH_IGNORE_END*@ before compiling. With 'setIgnoreComments' you can customise these comment blocks, if you need to.

#### Parameters
- {string} - Start block
- {string} - End block


### setPageDirType
Vash Static uses modules to organise your templates. By default it assumes you have at least a page module, which is abbreviated to 'pg' and is expected in the directory structure. With 'setPageDirType' you can change this, if you need to.

#### Parameters
- {string} - Replacement for 'pgDirType', which is 'pg' by default


### getPageDirType
Fetches the page module type ('pgDirType'), which is 'pg' by default


### getDirTypeFromPath
Takes a file path and array of directory types and returns the first type found in the path. If none are found, defaults to page type.

#### Parameters
- {string} filePath - A path to a file, such as a page, widget or global template.
- {string} dirTypes - List of types. This type will be searched for in the filePath and is expected to be a full directory name.
- returns {string} The type found in the file path or default page type.


### getFileName
Takes a file path and gets just the file name, optionally with the extention.

#### Parameters
- {string} filePath - Full file path to filter.
- {boolean} inclExt - Pass true to include the file extention.
- returns {string} Just the file name from a full file path.


### getModuleName
Gets the name of a module based on containing directory immediately nested within a 'type'. For example 'app/pg/home/tmpl/Index.vash' would return 'home' because '/pg/' is detected as a 'type'.

#### Parameters
- {string} filePath - A path to any file within a module.
- {string} type - Module 'type', such as 'pg', 'wg' or 'glb'.
- {boolean} [inclFileName] - Option to append the file name to the end.
- returns {string} Module name, using the first directory name after the 'type' is detected.
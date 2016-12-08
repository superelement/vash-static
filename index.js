var fs = require('fs-extra')
  , vash = require('vash')
  , slash = require('slash')
  , path = require('path')
  , sav = require('log-saviour')

const NS = "VashStatic"

// Tells JSHint that these guys can be globals
/*global warn:true, warnArr:true, log:true, logArr:true*/
sav.setNameSpace(NS)
warn = sav.warn
warnArr = sav.warnArr
log = sav.log
logArr = sav.logArr

var models
  , pgDirType = "pg"
  , suppressWarnings = false
  , startIgnore = "@*VASH_IGNORE_START*@"
  , endIgnore = "@*VASH_IGNORE_END*@"

/**
 * Escapes common special characters in regexes
 * @param {string} str - String to escape 
 */
function regSlash(str) {
    if (str.indexOf("?") !== -1) str = str.split("?").join("\\?");
    if (str.indexOf("*") !== -1) str = str.split("*").join("\\*");

    return str;
}


/**
 * Loads the template cache
 * @param {string} cacheDest - Path to the JSON file containing the vash template cache.
 * @returns {Object} Vash template cache object.
 */
function loadTmplCache(cacheDest) {
  if(!fs.existsSync(cacheDest) || cacheDest.indexOf(".json") === -1) {
    warn("loadTmplCache", "Cache destination did not exists or was not a '.json' file.", cacheDest)
    return null
  }
  return JSON.parse(fs.readFileSync(cacheDest))
}


/**
 * Loads the vash template cache and installs it into Vash
 * @param {string} tmplName - Name of the template, as stored in template cache, such as "pg_home/Index.vash"
 * @param {string} cacheDest - Path to the JSON file containing the vash template cache. 
 * @returns {string} Precompiled vash template function for the requested template name.
 */
function getTemplateFromCache(tmplName, cacheDest) {

  // loads our cached JSON file, with all the pre-compiled templates
  var tplcache = loadTmplCache(cacheDest)

  if(!tplcache) return null

  // installs them as Vash templates so they can be understood (eval used to convert strings to real functions) 
  // JSHint ignoring eval
  /* jshint ignore:start */
  for(var name in tplcache) {
    if(tplcache.hasOwnProperty(name)) {
      vash.install(name, eval(tplcache[name]))
    }
  }
  /* jshint ignore:end */

  return vash.helpers.tplcache[tmplName]
}


/**
 * Prepends all the widget and page models in the app, so they are accessible in the templates. Will use cached version for speed, unless 'forcedRefresh' is set to true.
 * @param {string} filePath - Path to the pre-concatenated models js file.
 * @param {string} type - Module type, such as 'pg', 'wg', 'glb'.
 * @param {string} tmpl - Contents of a template to prepend the models to. 
 * @param {boolean} forcedRefresh - Will use cached version for speed, unless this is set to true.
 * @param {Function} cb - Callback containing the combined contents on models and template.
 */
function prependModels(filePath, type, tmpl, forcedRefresh, cb) {

  if(typeof filePath !== "string") {
    warn(NS, "prependModels", "Could not prepend any models, as supplied 'filePath' was not a string.", filePath);
    cb(tmpl);
    return;
  }

  // checks stored version first
  if(models && !forcedRefresh) {
    cb(type === pgDirType ? models + tmpl : tmpl)
    return
  }

  if(!fs.existsSync(filePath)) {
    warn(NS, "prependModels", "Could not prepend any models, as supplied '"+filePath+"' could not be found.");
    cb(tmpl);
    return;
  }

  fs.readFile(filePath, function(err, _models) {

    if(err) {
      warn(err)
      _models = "";
    } else {
      _models = "@{\n" + _models + "\n}\n\n"
    }

    models = _models
    cb(type === pgDirType ? models + tmpl : tmpl)
  });

}



// gets options for vash compiling
function getTemplateOptions() {
  return { 
     modelName: "Model"
    ,helpersName: "Html"
  }
}


/**
 * Compiles a vash template and returns a 'precompiled' function to call. Assumes '@Model' syntax.
 * @param {string} tmpl - Template contents to compile.
 * @param {boolean} debugMode - Production usage should pass false to keep file size down. Development should use true, for useful debugging info.
 */
function compileTemplate(tmpl, debugMode) {
  var opts = getTemplateOptions()

  opts.debug = debugMode;
  opts.debugParser = debugMode;

  return vash.compile(tmpl, opts);
}


/**
 * Normalizes templates and then saves them again, optionally in a new dest. If contents is passed, doesn't need to read from the file system.
 * @param {string} tmplPath - File path to load template from.
 * @param {string} [dest] - Optionally pass a destination file path to save it to.
 * @param {string} [contents] - Optionally pass in the contents of a template, which will skip reading the 'tmplPath' from the file system and use this contents instead.
 * @param {Function} [cb] - Optionally receive a callback when completed successfully, containing the template contents.
 */
function normalizeTemplate(tmplPath, dest, contents, cb) {
  
  var fun = function(tmpl) {
    tmpl = normalizeRazorSyntax(tmpl);

    if(dest) {
      fs.outputFile(dest, tmpl, function(err) {
        if (err) warn(err);
        if(cb) cb(tmpl, err);
      });
    } else {
      if(cb) cb(tmpl);
    }
  }

  if(contents) {
    fun(contents)
    return
  }

  fs.readFile(tmplPath, function (err, tmpl) {
      fun(tmpl)
  });
}


/**
 * Takes a string and replaces all the chars in a string except the last one
 * @param {string} str - The string to modify
 * @param {string} findChar - The character set for replacement 
 * @param {string} replaceWithChar - The character to use for replacement
 * @returns {string} - The modified string. 
 **/
function replaceAllButLast( str, findChar, replaceWithChar ) {
  var newStr = ""
    , arr = str.split(findChar);
  
  // no changes
  if(arr.length === 1) return str;

  arr.forEach(function(ch, i) {
    if(i === 0) {
      newStr += ch;
    } else {
      if(i === arr.length-1) {
        newStr += findChar + ch;
      } else {
        newStr += replaceWithChar + ch;
      }
    }
  });

  return newStr;
}


/**
 * Takes in a template string and searches for opening and closing braces. If there is more than 1 closing brace, will replace subsequent closing braces with a specified 'closeSpec' character.
 * @param {string} tmpl - The template string to modify
 * @param {string} closeSnippet - Pass in a string 'snippet' to replace the closing braces temporarily, while other template conversion operations are happening, making sure to not include the "}" character. For example "++CLOSE_SPECIAL++". 
 * @param {boolean} useCloseSnippet - Forces the first closing brace to use the given 'closeSnippet'.
 * @returns {string} - The modified template string. 
 **/
function closeTemplateBraces(tmpl, closeSnippet, useCloseSnippet) {

  if(closeSnippet.indexOf("}") !== -1) {
    throw Error(NS + " -> closeTemplateBraces -> Your 'closeSnippet' param should not contain a '}' character, as the functions purpose is to substitute that character and logic will break if it exists.");
  } 
  
  var CLOSE_TEMP = "++CLOSE_TEMP++"
    , splitArr = tmpl.split("}");

  tmpl = tmpl.replace("}", useCloseSnippet ? closeSnippet : CLOSE_TEMP);
  
  if(tmpl.indexOf("}") !== -1) {
    tmpl = closeTemplateBraces(tmpl, closeSnippet, true);
  } else {
    // remove any remaining temporary placeholders
    tmpl = tmpl.split(CLOSE_TEMP).join("}");
  }

  return tmpl;
}

/**
 * Converts characters `@{` and first trailing `}` to special characters that can be converted back at a later stage
 * @param {string} tmpl - The template string to modify
 * @param {boolean} doSpceial - If true, will create special snippets. If false, will convert special snippets back to original characters.
 * @returns {string} - The modified template string. 
 **/
function convertLogicChars(openLogic, closeLogic, tmpl, doSpceial) {

  var OPEN_ORIG = "@{"
    , CLOSE_ORIG = "}"
    , newTmpl = "";
  

  if(doSpceial) {

    if(tmpl.indexOf( OPEN_ORIG ) !== -1) {
      tmpl.split( OPEN_ORIG ).forEach(function(chunk, i) {
        if(i === 0) {
          newTmpl += chunk;
        } else {

          newTmpl += openLogic;

          var openBraceSplit = chunk.split("{");

          // if nested braces detected, replace only the appropriate closing brace character and not the nested ones
          if(openBraceSplit.length > 1) {
            
            var newChunk = "";
            openBraceSplit.forEach(function(miniChunk, i) {
              if(i === 0) newChunk += miniChunk;
              else        newChunk += "{" + closeTemplateBraces(miniChunk, closeLogic);
            });

            // in some cases there may be multiple 'closeLogic' characters, if sibling braces (like if conditions) exist. This function ensures only the last one closes the logic block
            newChunk = replaceAllButLast( newChunk, closeLogic, "}");

            newTmpl += newChunk;
          } else {
            // if there are no nested braces, it is much simpler
            newTmpl += chunk.split(CLOSE_ORIG).join(closeLogic);
          }
        }
      });
    } else {
      return tmpl;
    }
  } else {
    // converts special snippets back to originals
    newTmpl = tmpl.split(openLogic).join(OPEN_ORIG).split(closeLogic).join(CLOSE_ORIG);
  }


  return newTmpl;
}


/**
 * Converts all 'string' based C# helpers to equivalent Vash helpers.
 * @param {string} tmpl - Template string to convert.
 * @returns {string} - The converted string.
 */
function convertStringHelpers(tmpl) {
  tmpl = tmpl.split("string.IsNullOrWhiteSpace").join("Html.StringIsNullOrWhiteSpace");
  tmpl = tmpl.split("String.IsNullOrWhiteSpace").join("Html.StringIsNullOrWhiteSpace");
  tmpl = tmpl.split("string.IsNullOrEmpty").join("Html.StringIsNullOrEmpty");
  tmpl = tmpl.split("String.IsNullOrEmpty").join("Html.StringIsNullOrEmpty");
  return tmpl;
}


/**
 * Takes a template and converts all C# 'forEach' loops into Vash helper foreach loops. This is tricky because the closing braces are '})' for JS/Vash, but only '}' for C#.
 * @param {string} tmpl - Template string to convert.
 * @returns {string} - The converted string.
 */
function convertForEach(tmpl) {
  
  var OPEN_FE = '@foreach'
    , CLOSE_FE = '++CLOSE_FE++'
    , OPEN_LOGIC = "++OPEN++"
    , CLOSE_LOGIC = "++CLOSE++";

  var tmplSplit = tmpl.split(OPEN_FE);

  // if no @foreach loops, return same string as received
  if(tmplSplit.length === 1) return tmpl;

  // grabs the first bunch of characters of the template affected so you can find and debug it
  var tmplErrorFinder = " ---- FOUND IN: " + tmpl.substr(0, 50);

  var newTmpl = "";
  tmplSplit.forEach(function(chunk, i) { // goes through each '@foreach' split

    chunk = convertLogicChars(OPEN_LOGIC, CLOSE_LOGIC, chunk, true);

    var splitArr = chunk.split("{") // code before the '@foreach'  ----plus----  code after first '{'
      , loopLogic = splitArr[0] // code before the '{'
      , trailingCode = getAllButFirst(chunk, "{") // code after '{' all the way up to the next '@foreach'

    if(i === 0) {
      newTmpl += chunk;
    } else {

      newTmpl += getForEachLogic( loopLogic, tmplErrorFinder );

      var openFESplit = trailingCode.split("{");

      // if nested braces detected, replace only the appropriate closing brace character and not the nested ones
      if(openFESplit.length > 1) {
        
        var newChunk = "";
        
        openFESplit.forEach(function(miniChunk, j) {
          if(j === 0) {
            newChunk += miniChunk;
          } else {

            // if there is a closing brace before any opening braces (which is why index 1 is a condition)
            var isClosingFE = miniChunk.indexOf("}") !== -1 && j === 1;
            
            newChunk += "{" + closeTemplateBraces(miniChunk, CLOSE_FE, isClosingFE );
          }
        });

        newTmpl += newChunk;

      } else {
        // console.log("--trailingCode", trailingCode)
        // if there are no nested braces, it is much simpler
        newTmpl += trailingCode.split("}").join(CLOSE_FE);
      }
    }
  });

  // now replace the markers with proper syntax for vash helper
  newTmpl = newTmpl.split(CLOSE_FE).join("})");
  newTmpl = newTmpl.split(OPEN_LOGIC).join("@{");
  newTmpl = newTmpl.split(CLOSE_LOGIC).join("}");

  return newTmpl;
}



/**
 * Gets segment of template string after first instance of a specified 'splitChar' character until the end of that string.
 * @param {string} tmpl - Template string to convert.
 * @param {string} splitChar - Character used to split.
 * @returns {string} - Combined string. 
 */
function getAllButFirst( tmpl, splitChar ) {
  var splitArr = tmpl.split(splitChar);

  var newStr = "";
  splitArr.forEach(function(str, i) {
    if(i>0) newStr += splitChar + str;
  });

  return newStr;
}


/**
 * Converts C# 'foreach' statement logic to work with Vash Helper 'foreach'.
 * @param {string} statementLogic - Code from 'foreach' until the opening brace.
 * @param {string} tmplErrorFinder - Chunk of HTML from the template to aid in finding the correct file to debug. 
 * @returns {string} - The Vash helper 'foreach' statement logic.
 */
function getForEachLogic( statementLogic, tmplErrorFinder ) {
  var itemName;
  if(statementLogic.indexOf('var ') === -1) { // warn if no 'var' found, as 'var' is the expected variable keyword to be used
    warn(NS, "convertForEach", "No item variable name detected within 'foreach' loop. It should be defined by 'var' keyword and use a single space to separate it - for example '@foreach(var item ...'. Defaulting to 'item'.", tmplErrorFinder);
    itemName = "item in "; // if no item variable name is detected, defaults to 'item', and includes the ' in ' so next condition doesn't error
  }
  itemName = statementLogic.split('var ')[1]; // gets the variable name, but still includes trailing ' in ...' code

  if(itemName.indexOf(" in ") === -1) { // errors if can't find 'in' keyword
    throw Error(NS + " - convertForEach - Could not find the 'in' keyword after the variable in 'foreach' loop. Please check your syntax follows this pattern '@foreach(var item in ...'" + tmplErrorFinder);
  }
  
  itemName = itemName.split(" in ")[0]; // separates the variable name from the rest of the code on that line

  var listName = statementLogic.split(" in ")[1].split(")")[0]; // gets the list variable name

  return '@Html.foreach(' + listName + ', function('+ itemName +') ';
}



/**
 * Makes vash syntax more like Razor for C#
 * @param {string} tmpl - Template contents, potentially containing common C# syntax that Vash does not understand.
 * @returns {string} - Template contents with common C# syntax converted into Vash-friendly code. 
 */
function normalizeRazorSyntax(tmpl) {
  tmpl = tmpl.toString();

  // removes vash comment blocks
  var igRX = new RegExp(regSlash(startIgnore) + "[\\s\\S]*?" + regSlash(endIgnore), "g")
  tmpl = tmpl.replace(igRX, "")

  // removes comments
  var cmRX = new RegExp(regSlash("@*") + "[\\s\\S]*?" + regSlash("*@"), "g" )
  tmpl = tmpl.replace(cmRX, "")

  //tmpl = tmpl.split("@Model").join("@model");
  tmpl = tmpl.split("Html.Raw").join("Html.raw");
  tmpl = tmpl.split(".Length").join(".length");
  tmpl = tmpl.split(".Count").join(".length");
  tmpl = tmpl.split(".Any()").join(".length>0");

  tmpl = convertForEach(tmpl);
  tmpl = convertStringHelpers(tmpl);

  return tmpl;
}


/**
 * Takes a file path and gets just the file name, optionally with the extention.
 * @param {string} filePath - Full file path to filter.
 * @param {boolean} inclExt - Pass true to include the file extention.
 * @returns {string} Just the file name from a full file path.
 */
function getFileName(filePath, inclExt) {
	filePath = slash(filePath);
	
	var lastSlashIndex = filePath.lastIndexOf("/");

  if(inclExt) return filePath.slice(lastSlashIndex + 1);

  var lastDotIndex = filePath.lastIndexOf(".");
	return filePath.slice(lastSlashIndex + 1, lastDotIndex);
}


/**
 * Gets the name of a module based on containing directory immediately nested within a 'type'. For example 'app/pg/home/tmpl/Index.vash' would return 'home' because '/pg/' is detected as a 'type'.
 * @param {string} filePath - A path to any file within a module.
 * @param {string} type - Module 'type', such as 'pg', 'wg' or 'glb'.
 * @param {boolean} [inclFileName] - Option to append the file name to the end.
 * @returns {string} Module name, using the first directory name after the 'type' is detected. 
 */
function getModuleName(filePath, type, inclFileName) {

  filePath = path.normalize(filePath);
  filePath = slash(filePath);

  var fullFileName = getFileName(filePath, true)
    , fileName = inclFileName ? getFileName(filePath) : ""
    , splitArr = filePath.split(type+"/")

  // If file name has no 'module' parent, such as a page or widget name, we return nothing. This might be the case for 'global' templates like _Layout.vash
  if(splitArr[0] + type+"/" + fullFileName === filePath) return "" + fileName;
  
  // If a module name is found in the path, after the 'type', we return it. For example, assuming "pg" is the type, "pg/home/tmpl/page.vash" would return "home"
  var pathRelativeFromType = splitArr[1]
    , moduleName = pathRelativeFromType.split("/")[0]

  return moduleName + ( moduleName && fileName ? "/" : "" ) + fileName;
}


/**
 * Adds custom Vash helpers to the compilation.
 * @param {string} newHelpers - and array of paths pointing to additional Vash helpers. If same name as defaults are used, they will override defaults.
 */
function setCustomHelpers(newHelpers) {

  // if no helpers supplied, use defaults
  var helpers = [
     __dirname + "/vash-helpers/RenderPartial.vash"
    , __dirname + "/vash-helpers/foreach.vash"
    , __dirname + "/vash-helpers/LayoutContent.vash"
    , __dirname + "/vash-helpers/StringIsNullOrEmpty.vash"
    , __dirname + "/vash-helpers/StringIsNullOrWhiteSpace.vash"
  ];

  if(newHelpers) {
    newHelpers.forEach(function(path) {
      var name1 = getFileName(path)
        , found = false

      helpers.forEach(function(path, i) {
        
        // if name in 'newHelpers' is the same, here it overrides default one
        if(name1 === getFileName(path)) {
          helpers[i] = path
          found = true
          return false
        }
      })

      // if not found in defaults, appends it to the list
      if(!found) helpers.push(path)
    })
  }

  var fun = function(filePath) {

    var hlpTmpl = fs.readFileSync(filePath).toString()
    
    hlpTmpl = normalizeRazorSyntax(hlpTmpl)
    
    vash.compileHelper(hlpTmpl, getTemplateOptions())
  }

  helpers.forEach(function(filePath) {
    fun(filePath)
  })
}


// TODO: detect if 'pgName' is '*' and render all pages
/**
 * Renders a 'page' vash template by name, which should be stored in the cacheDest, with optional helpers.
 * @param {string} cacheDest - Path to the JSON file containing the vash template cache.
 * @param {string} pgName - Name of the page module.
 * @param {string[]} [helpers] - Array of paths to use as Vash helpers. Defaults will be used, unless overridden by name. Otherwise both lists will be used.
 */
function renderPage(cacheDest, pgName, helpers) {
  setCustomHelpers(helpers)

  var precompTmpl = getTemplateFromCache(pgDirType + "_" + pgName, cacheDest)

  if(!precompTmpl) {
    return {
    	success: false,
    	contents: ["Stopping 'renderPage' early. Seems like that page doesn't have a precompiled Vash template. Try pre-compiling first.", pgName]
    }
  }

  return {
  	success: true,
  	contents: precompTmpl()
  }
}


/**
 * Takes a file path and array of directory types and returns the first type found in the path. If none are found, defaults to page type.
 * @param {string} filePath - A path to a file, such as a page, widget or global template.
 * @param {string[]} dirTypes - List of types. This type will be searched for in the filePath and is expected to be a full directory name.
 * @returns {string} The type found in the file path or default page type.
 */
function getDirTypeFromPath(filePath, dirTypes) {
	
	filePath = slash(filePath);

	var type = pgDirType; // page directory types will get models attached to them
    dirTypes.forEach(function(t) {
    	if(filePath.indexOf("/" + t + "/") !== -1) {
    		type = t;
    		return false;
    	}
    });

    return type;
}


/**
 * Ensures the path given ends in a "/" character.
 * @param {string} path - Directory path to check.
 * @returns {string} Path with guarunteed trailing slash.
 */
function ensureTrainlingSlash(filePath) {
    if(filePath.substr(filePath.length - 1) !== "/") filePath += "/";
    return filePath;
}



/**
 * Precompiles and updates an individual cached template. Can be used on a file watch.
 * @param {Object} opts - Options for the function:
    * @param {boolean} [opts.debugMode] - Production usage should pass false to keep file size down. Development should use true, for useful debugging info. Defaults to false.
    * @param {string} [opts.modelsPath] - File path to the combined models js file, which can prepend your templates to provide model data. If not given, no models will be added.
    * @param {string} opts.type - Module type, such as 'pg', 'wg', 'glb'. Will default to page type.
    * @param {string} opts.tmplPath - File path to load template from.
    * @param {string} opts.cacheDest - Path to the JSON file containing the vash template cache.
    * @param {string} [opts.contents] - Optionally pass the contents of a template, which just saves an extra read from the file system. If your creating a Gulp plugin, you could get this from vinyl stream.
    * @param {Function} [opts.cb] - Optionally have a callback trigger, passing the success status and (if true) template name.
 */
function updateCache(opts) {

  opts = opts || {};
  opts.debugMode = opts.debugMode || false;
  opts.modelsPath = opts.modelsPath || null;

  var msg;

  if(typeof opts.type !== "string") {
    opts.type = opts.type || pgDirType;
    warn(NS, "Config object should contain a 'type' property of type string. Defaulting to '" + pgDirType + "'.")
  }

  if(typeof opts.tmplPath !== "string") {
    msg = "Config object must contain a 'tmplPath' property of type string.";
    if(opts.cb) opts.cb(false, msg);
    else        warn(NS, "updateCache", msg);
    return;
  }
  
  // var filePath = opts.type + "/" + getModuleName(opts.tmplPath, opts.type, true) + ".vash"
	var isModel = !opts.contents // if contents in false, we're assuming a model has been changed

	normalizeTemplate(opts.tmplPath, false, opts.contents, function(tmpl) {

		prependModels(opts.modelsPath, opts.type, tmpl, isModel, function(tmpl) {

			tmpl = compileTemplate(tmpl, opts.debugMode)

			var tmplName = opts.type + "_" + getModuleName(opts.tmplPath, opts.type, true)
      
			// update vash runtime cache as well as cache on file system, just in case you're running this task will compiling
			vash.install(tmplName, tmpl)

			var cnf = loadTmplCache(opts.cacheDest)

			if(!cnf[tmplName]) warn("updateCache", "There was no pre-existing cached template with that name.", tmplName )

			// replaces the existing cached template with the same name
			cnf[tmplName] = tmpl.toClientString()

			fs.outputFile(opts.cacheDest, JSON.stringify(cnf), function(err) {
        if(opts.cb) {
          if(err) opts.cb(false, err);
          else    opts.cb(true, tmplName);
        } else if(err) {
          warn(NS, "updateCache", err);
        }
      })

		})
	})
}


/**
 * Precompiles a single vash template and passes the template's name and contents in the callback.
 * @param {object} opts - Options for the function:
    * @param {string} opts.file - File path to the template.
    * @param {boolean} [opts.debugMode] - Production usage should pass false to keep file size down. Development should use true, for useful debugging info. Defaults to false. 
    * @param {string[]} [opts.dirTypes] - List of types. This type will be searched for in the filePath and is expected to be a full directory name. If not given, only page type will be used.
    * @param {string} [opts.modelsPath] - File path to the combined models js file, which can prepend your templates to provide model data. If not given, no models will be added.
 */
function precompileTemplateCache(opts, cb) {

  var msg;
  if(typeof opts.file !== "string") {
    msg = "Config object must contain a 'file' property of type string.";
    if(cb) cb(false, msg);
    else   warn(NS, "precompileTemplateCache", msg);
    return;
  }

  if(!fs.existsSync(opts.file)) {
    msg = "prependModels", "Could not find 'file'. '"+opts.file+"' could not be found.";
    if(cb) cb(false, msg);
    else   warn(NS, "precompileTemplateCache", msg);
    return;
  }

	var filePath = slash(opts.file);

  // sets default options
  opts = opts || {};
  opts.debugMode = opts.debugMode || false;
  opts.dirTypes = opts.dirTypes || [ pgDirType ];
  opts.modelsPath = opts.modelsPath || null;


  // page directory types will get models attached to them
  var type = getDirTypeFromPath(filePath, opts.dirTypes);
  
  var cnf = {
    filePath: filePath,
    type: type,
    // creates a new template name like "wg_appHeader/appHeader" or "wg_appHeader/navItem" or "pg_home/home"
    newTmplName: type + "_" + getModuleName(filePath, type, true)
  }

  normalizeTemplate(cnf.filePath, false, false, function(tmpl) {

      prependModels(opts.modelsPath, cnf.type, tmpl, false, function(tmpl) {

        var precompiled = compileTemplate(tmpl, opts.debugMode)
          
          vash.install(cnf.newTmplName, precompiled);

          if(cb) cb(true, { name: cnf.newTmplName, msg: null, contents: precompiled.toClientString() })
      })
  })
}


// Exporting the plugin main function
module.exports = {
	renderPage: renderPage
	, precompileTemplateCache: precompileTemplateCache
	, setIgnoreComments: function(start, end) {
    startIgnore = start;
    endIgnore = end;
  }
  , setPageDirType: function(type) {
		pgDirType = type;
	}
  , getPageDirType: function() {
		return pgDirType;
	}
	, updateCache: updateCache
  , getDirTypeFromPath: getDirTypeFromPath
  , getFileName: getFileName
  , getModuleName: getModuleName
  
  // just for unit tests
  , testable: {
      suppressWarnings: sav.suppressWarnings
    , getVashInstance: function() {
      return vash;
    }
    , normalizeRazorSyntax: normalizeRazorSyntax
    , normalizeTemplate: normalizeTemplate
    , regSlash: regSlash
    , loadTmplCache: loadTmplCache
    , getTemplateFromCache: getTemplateFromCache
    , prependModels: prependModels
    , compileTemplate: compileTemplate
    , setCustomHelpers: setCustomHelpers
    , convertForEach: convertForEach
    , convertStringHelpers: convertStringHelpers
    , convertLogicChars: convertLogicChars
    , closeTemplateBraces: closeTemplateBraces
    , replaceAllButLast: replaceAllButLast
  }
}
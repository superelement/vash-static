var fs = require("fs-extra")
  , slash = require('slash')

var vashStatic = require("./index.js")

var MAIN_DIR = slash(__dirname + "/")
  , TEST_RES = MAIN_DIR + "test-resources/"
  , TEMP_DIR = MAIN_DIR + "dist/tmp/"
  , CACHE_PATH = TEMP_DIR + "precompiled-vash.json"
  , PAGE_TYPE = "page"

/*
 * Creating a template cache
 */

var step1 = function(cb) {
    vashStatic.precompileTemplateCache({
        file: TEST_RES + PAGE_TYPE + "/about/Index.vash" // path to template you want to precompile
        , debugMode: true // for development should be true, but production should be false (or omitted) to keep file size down
        , dirTypes: [PAGE_TYPE] // Module type is 'pg' (page), which is matched against the containing directory name (eg "app/pg/home/Index.vash")
        , modelsPath: TEST_RES + "models.js" // Optionally prepend a JS file containing models used to render the templates.
    }, function(success, tmpl) {
        if(success) {
            var cache = {};
            cache[ tmpl.name ] = tmpl.contents;
            fs.outputFileSync(CACHE_PATH, JSON.stringify(cache))
            cb();
        }
    })
}


/*
 * Update an existing item in the template cache
 */

function step2(cb) {
    vashStatic.updateCache({
        type: PAGE_TYPE
        , tmplPath: TEST_RES + PAGE_TYPE + "/about/Index.vash"
        , contents: null
        , modelsPath: TEST_RES + "models.js"
        , cacheDest: CACHE_PATH
        , debugMode: true
        , cb: function(success, templateName) {
            // console.log(success, templateName)
            if(success) cb();
        }
    });
}


/*
 * 'Ignore' comments can be customised. 
 * By default they will strip out everthing between @*VASH_IGNORE_START*@ and @*VASH_IGNORE_END*@ before compiling.
 * You can change that here if you want though.
 */

vashStatic.setIgnoreComments("@*IGNR_START*@", "@*IGNR_END*@");


/*
 * Vash Static uses modules to organise your templates. 
 * By default it assumes you have at least a page module, which is abbreviated to 'pg' and is expected in the directory structure.
 * You can change this here though. We've changed it to 'page' to show this.
 */

vashStatic.setPageDirType(PAGE_TYPE);

// and if you need to fetch it use 'getPageDirType'
console.log( vashStatic.getPageDirType() )


/*
 * Render a page to HTML
 */

step1(function() {
    step2(function() {

        var render = vashStatic.renderPage(CACHE_PATH, "about/Index")
        
        if(render.success) {
            fs.outputFileSync(TEMP_DIR + "About.html", render.contents)
            console.log("Rendered file output to " + TEMP_DIR + "About.html")
        }
    });
});


/*
 * Other useful methods:
 */

// Extracts the first directory type found from a path. In this example, "widget" is found.  
console.log( vashStatic.getDirTypeFromPath("app/widget/header/Index.vash", ["page", "widget", "global"]) )
//OUTPUT: page


// Takes a file path and gets just the file name, optionally with the extention.
console.log( vashStatic.getFileName("app/widget/header/Index.vash", true) )
//OUTPUT: widget


/**
 * Gets the name of a module based on containing directory immediately nested within a 'type'.
 * For example 'app/pg/home/tmpl/Index.vash' would return 'home' because '/pg/' is detected as a 'type'.
 * If we pass true to last parameter, it will include the file name (without extention), which is a handy naming convension for templates.
 */ 
console.log( vashStatic.getModuleName('app/pg/home/tmpl/Index.vash', "pg", true) )
//OUTPUT: home/Index
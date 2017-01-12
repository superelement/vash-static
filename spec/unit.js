var fs = require("fs-extra")
  , slash = require('slash')

var vashStatic = require("../index.js")

// stops console from clogging up with warnings during tests
vashStatic.testable.suppressWarnings(true);

var MAIN_DIR = slash(__dirname).split("spec")[0]
  , TEST_RES = MAIN_DIR + "test-resources/"
  , TEMP_DIR = MAIN_DIR + "dist/tmp/"
  , SAMPLE_CACHE = TEST_RES + "sample-template-cache.json"

afterEach(function() {
	fs.removeSync(TEMP_DIR);
})

describe("normalizeRazorSyntax", function() {

	var fun = vashStatic.normalizeRazorSyntax
	  , start = "@*VASH_IGNORE_START*@"
	  , end = "@*VASH_IGNORE_END*@"

	it("should remove code between 'ignore' comments on same line", function() {
		var tmpl = "1"+start+"2"+end
		expect(fun(tmpl)).toBe("1")
	})

	it("should remove block comments", function() {
		var tmpl = "1@*2\n3\n4*@"
		expect(fun(tmpl)).toBe("1")
	})

	it("should convert common C# razor syntax to vash-friendly syntax", function() {
		expect(fun("Html.Raw()")).toBe("Html.raw()")
		expect(fun("a.Length")).toBe("a.length")
		expect(fun("b.Count")).toBe("b.length")
		expect(fun("b.Any()")).toBe("b.length>0")
	})

	it("should remove code between 'ignore' comments across multiple line breaks", function() {
		var tmpl = "1"+start+"2\n3\n4"+end
		expect(fun(tmpl)).toBe("1")
	})

	it("should remove code between custom 'ignore' comments", function() {
		var customStart = "@*CUSTOM_IGNORE_START*@"
		  , customEnd = "@*CUSTOM_IGNORE_END*@"
		  , tmpl = "1"+ customStart +"2\n3\n4"+ customEnd;
		
		// changes the default ignore comments
		vashStatic.setIgnoreComments(customStart, customEnd)
		expect(fun(tmpl)).toBe("1")

		// reverts the default ignore comments
		vashStatic.setIgnoreComments(start, end)
	})
})


describe("normalizeTemplate", function() {
	var fun = vashStatic.testable.normalizeTemplate
	  , tmplPath = TEST_RES + "complex.vash"
	  , dest = TEMP_DIR + "normalizeTemplate/complex.cshtml"
	  , originalContents = fs.readFileSync(tmplPath).toString()
	  , normalizedContents = function() { return vashStatic.normalizeRazorSyntax(originalContents) } // using function so 'describe' doesn't execute it

	it("should read a template from file system, then save it to the destination file path and pass the same contents to the callback", function(done) {
		fun(tmplPath, dest, null, function(contents) {
			expect(contents).toBe(fs.readFileSync(dest).toString())
			
			tryToCompile(contents)
			done()
		})
	})
	
	it("should pass in template contents and expect it to be 'normalized' in the destination output", function(done) {
		fun(null, dest, originalContents, function(contents) {
			expect(contents).not.toBe(originalContents)
			expect(contents).toBe(normalizedContents())
			
			tryToCompile(contents)
			done()
		})
	})
	
	it("should still return contents if 'dest' is not given", function(done) {
		fun(tmplPath, null, null, function(contents) {
			expect(contents).toBe(normalizedContents())
			
			tryToCompile(contents)
			done()
		})
	})
})

describe("getFileName", function() {
	var fun = vashStatic.getFileName

	it("should get just the file name from a path, without the extension", function() {
		expect(fun('example\\windows\\file.js')).toBe("file")
		expect(fun('example/unix/file.js')).toBe("file")
	})
	
	it("should get the file name from a path with the extension", function() {
		expect(fun('example\\windows\\file.js', true)).toBe("file.js")
		expect(fun('example/unix/file.js', true)).toBe("file.js")
	})
})

describe("regSlash", function() {
	var fun = vashStatic.testable.regSlash

	it("should escape common regular expression characters", function() {
		expect(fun("?")).toBe("\\?")
		expect(fun("*")).toBe("\\*")
	})
})

describe("loadTmplCache", function() {
	var fun = vashStatic.testable.loadTmplCache

	it("should load a valid json file (synchronously) and check it's contents", function() {

		var cache = fun(SAMPLE_CACHE)
		
		expect(cache).not.toBe(null)
		expect(typeof cache).toBe("object")
		expect(cache.hasOwnProperty("pg_about/Index")).toBe(true)
	})

	it("should fail to load a non-existant file", function() {
		var cache = fun(TEST_RES + "non-existant-file.json")
		
		expect(cache).toBe(null)
	})

	it("should fail to load a non-json file", function() {
		var cache = fun(TEST_RES + "simple.vash")
		
		expect(cache).toBe(null)
	})
})


describe("getTemplateFromCache", function() {
	var fun = vashStatic.testable.getTemplateFromCache

	it("should return a template from cache, by name", function() {
		expect(typeof fun("pg_about/Index", SAMPLE_CACHE)).toBe("function")
	})

	it("should return falsy when template name does not exist", function() {
		expect(fun("non_existantTemplate", SAMPLE_CACHE)).toBeFalsy()
	})

	it("should return falsy when 'cacheDest' is non-existant", function() {
		var cacheDest = TEST_RES + "non-existant-file.json"

		expect(fun("non_existantTemplate", cacheDest)).toBeFalsy()
	})
})


describe("prependModels", function() {
	var fun = vashStatic.testable.prependModels
	  , tmpl = "sample template"
	  , modelsFilePath = TEST_RES+"models.js"

	it("should load a js file containing JS models, then prepend it as a string to the supplied template string (asynchronously), when a 'page' type", function(done) {
		vashStatic.setPageDirType("pg")

		var modelsContent = fs.readFileSync(modelsFilePath)

		fun(modelsFilePath, "pg", tmpl, true, function(newTmpl) {
			
			expect(newTmpl).toContain(modelsContent)
			expect(newTmpl).toContain(tmpl)
			done()
		})
	})
})

describe("getDirTypeFromPath", function() {
	var fun = vashStatic.getDirTypeFromPath
	  , dirTypes = ["pg", "wg", "glb"]

	it("should get the 'type' from the file path", function(){
		expect(fun("dev/app/wg/header/tmpl/Index.vash", dirTypes)).toBe("wg")
	})
	
	it("should get a 'type' even with Windows back slashes", function(){
		expect(fun("dev\\app\\glb\\_Layout.vash", dirTypes)).toBe("glb")
	})

	it("should revert to page 'type' from the file path, when no match is found", function(){
		expect(fun("dev/app/xxxx/header/tmpl/Index.vash", dirTypes)).toBe("pg")
	})
})



describe("getModuleName", function() {
	var fun = vashStatic.getModuleName

	it("should get just the module name", function(){
		expect(fun("app/wg/header/tmpl/Index.vash", "wg")).toBe("header")
	})

	it("should get the module name appended with file name", function(){
		expect(fun("app/wg/header/tmpl/Index.vash", "wg", true)).toBe("header/Index")
	})

	it("should return empty string if no module name exists", function(){
		expect(fun("app/glb/_Layout.vash", "glb")).toBe("")
	})

	it("should return just file name if no module name exists", function(){
		expect(fun("app/glb/_Layout.vash", "glb", true)).toBe("_Layout")
	})
})

describe("compileTemplate", function() {
	var fun = vashStatic.testable.compileTemplate

	it("should compile a simple razor string, using @Model syntax", function(){
		var precompiled = fun("<p>@Model.Title</p>")
		expect(precompiled({Title: "Vash Static"})).toBe("<p>Vash Static</p>")
	})

	it("should compile a simple razor string from 'simple.vash'", function(){

		var sample = fs.readFileSync(TEST_RES + "simple.vash").toString();
		var precompiled = fun(sample);
		var contents = precompiled({});

		expect(contents).toContain("Simple template");
	})
})

describe("setCustomHelpers", function() {
	var fun = vashStatic.testable.setCustomHelpers

	it("should render a template using the default helper 'foreach'", function(){
		fun()
		var precompiled = vashStatic.testable.compileTemplate('@Html.foreach(["I", " am", " a", " list", " sample"], function(item) { @item })')
		expect(precompiled()).toBe("I am a list sample")
	})
	
	it("should render a template using the custom helper 'noHelp'", function(){
		fun([TEST_RES + "no-help.vash"])
		var precompiled = vashStatic.testable.compileTemplate('@Html.noHelp()')
		expect(precompiled()).toBe("Example of custom helper")
	})

	describe("StringIsNullOrEmpty", function() {

		it("Helper StringIsNullOrEmpty should include the code in condition, based on the provided string being empty", function() {
			fun()
			var sample = fs.readFileSync(TEST_RES + "StringIsNullOrEmpty-1.vash").toString()
			, precompiled = vashStatic.testable.compileTemplate(sample)
			expect(precompiled()).toContain("<p>should render</p>")
		})

		it("Helper StringIsNullOrEmpty should exclude the code in condition, based on the provided string having content", function() {
			fun()
			var sample = fs.readFileSync(TEST_RES + "StringIsNullOrEmpty-2.vash").toString()
			, precompiled = vashStatic.testable.compileTemplate(sample)
			expect(precompiled()).not.toContain("<p>should not render</p>")
		})

		it("CS 'string.IsNullOrEmpty' should include the code in condition, based on the provided string being empty", function() {
			fun()
			var sample = fs.readFileSync(TEST_RES + "StringIsNullOrEmpty-CS.vash").toString()
			sample = vashStatic.normalizeRazorSyntax(sample)
			var precompiled = vashStatic.testable.compileTemplate(sample)
			expect(precompiled()).toContain("<p>should render</p>")
		})
	})

	describe("StringIsNullOrWhiteSpace", function() {

		it("Helper StringIsNullOrWhiteSpace should include the code in condition, based on the provided string containing only spaces", function() {
			fun()
			var sample = fs.readFileSync(TEST_RES + "StringIsNullOrWhiteSpace-1.vash").toString()
			, precompiled = vashStatic.testable.compileTemplate(sample)
			expect(precompiled()).toContain("<p>should render</p>")
		})
		
		it("Helper StringIsNullOrWhiteSpace should exclude the code in condition, based on the provided string having content", function() {
			fun()
			var sample = fs.readFileSync(TEST_RES + "StringIsNullOrWhiteSpace-2.vash").toString()
			, precompiled = vashStatic.testable.compileTemplate(sample)
			expect(precompiled()).not.toContain("<p>should not render</p>")
		})
		
		it("CS 'string.IsNullOrWhiteSpace' should include the code in condition, based on the provided string being empty", function() {
			fun()
			var sample = fs.readFileSync(TEST_RES + "StringIsNullOrWhiteSpace-CS.vash").toString()
			sample = vashStatic.normalizeRazorSyntax(sample)
			var precompiled = vashStatic.testable.compileTemplate(sample)
			expect(precompiled()).toContain("<p>should render</p>")
		})
	})
})

describe("renderPage", function() {
	var fun = vashStatic.renderPage

	it("should render page 'pg_about/Index' from the sample template cache, which contains a 'glb__Layout' and foreach helper", function(){
		var result = fun(SAMPLE_CACHE, 'about/Index');
		expect(result.success).toBe(true)
		expect(result.contents).toContain("About Us"); // from Title
		expect(result.contents).toContain("I am a list sample"); // from foreach helper
	})
})

describe("updateCache", function() {
	var fun = vashStatic.updateCache

	it("should update the template cache with the 'pg/home/Index.vash' sample page", function(done){
		fun({
			type: "pg"
			, tmplPath: TEST_RES + "pg/home/Index.vash"
			, contents: null
			, modelsPath: TEST_RES + "models.js"
			, cacheDest: SAMPLE_CACHE
			, debugMode: true
			, cb: function(success, templateName) {
				// console.log("templateName", templateName)
				expect(success).toBe(true)
				expect(templateName).toBe("pg_home/Index")

				var cache = vashStatic.testable.getTemplateFromCache("pg_home/Index", SAMPLE_CACHE)
				expect(cache()).toContain("Welcome Home")
				done();
			}
		})
	})
})


describe("precompileTemplateCache", function() {
	var fun = vashStatic.precompileTemplateCache

	it("should return a precompiled template function as a string, so it can be stored in a JSON file", function(done){
	 	var opts = {
			 file: TEST_RES + "pg/home/Index.vash"
			 , debugMode: true
			 , dirTypes: ["pg"]
			 , modelsPath: TEST_RES + "models.js"
		 }
		 fun(opts, function(success, tmpl) {
			 var name = "pg_home/Index"
			 expect(success).toBe(true)
			 expect(tmpl.name).toBe(name)
			 expect(typeof tmpl.contents).toBe("string");
			 expect(tmpl.contents).toContain("Home Page"); // "Home Page"" is a string within the vash template
			 expect(tmpl.contents).toContain("Jimmy D"); // "Jimmy D"" is a string within the sample models.js file
			 done()
		 })
	})
})

describe("convertLogicChars", function() {
	var fun = vashStatic.testable.convertLogicChars

	var OPEN_ORIG = "@{"
      , CLOSE_ORIG = "}"
      , OPEN_SPEC = "++OPEN++"
      , CLOSE_SPEC = "++CLOSE++"

	it("should convert '"+OPEN_ORIG+"' and '"+CLOSE_ORIG+"' to special character snippets", function(){
		expect( fun(OPEN_SPEC, CLOSE_SPEC, 'stuff ' + OPEN_ORIG+" stuff "+CLOSE_ORIG, true) ).toBe('stuff ' + OPEN_SPEC+" stuff "+CLOSE_SPEC);
	})

	it("should only convert closing brace related to logic opener when an if condition gets thrown into the mix", function(){
		var contents = " stuff if(another) { brace example } ";
		expect( fun(OPEN_SPEC, CLOSE_SPEC, 'stuff ' + OPEN_ORIG+ contents +CLOSE_ORIG, true) ).toBe('stuff ' + OPEN_SPEC+ contents +CLOSE_SPEC);
	})

	it("should only convert closing brace related to logic opener when multiple if conditions get thrown into the mix", function(){
		var contents = " stuff \n if(first) { \n brace example \n if(second) { \n brace example \n if(third) { \n brace example } \n } \n if(fouth) { \n brace example \n } \n } ";
		expect( fun(OPEN_SPEC, CLOSE_SPEC, 'stuff ' + OPEN_ORIG+ contents +CLOSE_ORIG, true) ).toBe('stuff ' + OPEN_SPEC+ contents +CLOSE_SPEC);
	})
})


describe("convertForEach", function() {

	var fun = vashStatic.testable.convertForEach
	  , originalForEachSimple = fs.readFileSync(TEST_RES + "foreach-simple.vash").toString()
	  , originalForEachMultiLine = fs.readFileSync(TEST_RES + "foreach-multi-line.vash").toString()
	  , originalForEachNested1 = fs.readFileSync(TEST_RES + "foreach-nested-1.vash").toString()
	  , originalForEachNested2 = fs.readFileSync(TEST_RES + "foreach-nested-2.vash").toString()

	it("should should convert a simple C# razor `@foreach` loop into vash a compatible one", function(){
		// enables warnings and logs for this test
		vashStatic.testable.suppressWarnings(false);
		
		var contents = fixLineReturns( fun(originalForEachSimple) )
		//console.log("contents", contents)
		expect(contents).toContain('@Html.foreach(list, function(item) {\n\t<p>stuff @item stuff</p>\n})')
		
		// also ensure training content exists
		expect(contents).toContain('<p>trailing content</p>')

		expect(contents).toContain('//leading comment')
		
		// suppresses warnings and logs again
		vashStatic.testable.suppressWarnings(true);
	})
	
	it("should should convert a mutli-line C# razor `@foreach` loop into vash a compatible one", function(){
		// enables warnings and logs for this test
		vashStatic.testable.suppressWarnings(false);
		
		var contents = fixLineReturns( fun(originalForEachMultiLine) )
		//console.log("contents", contents)
		expect(contents).toContain('@Html.foreach(list, function(item) {\n\t<p>stuff @item stuff\n\tstuff @item stuff</p>\n})')
		
		// suppresses warnings and logs again
		vashStatic.testable.suppressWarnings(true);
	})
	
	
	it("should should convert a nested 1 C# razor `@foreach` loop into vash a compatible one", function(){
		// enables warnings and logs for this test
		vashStatic.testable.suppressWarnings(false);
		
		var contents = fixLineReturns( fun(originalForEachNested1) )

		// for debugging
		// fs.outputFileSync( TEMP_DIR + "convertForEach/foreach-nested-1.vash", contents );

		tryToCompile(contents)
		
		// suppresses warnings and logs again
		vashStatic.testable.suppressWarnings(true);
	})

	// WIP
	it("should should convert a nested 2 C# razor `@foreach` loop into vash a compatible one", function(){
		// enables warnings and logs for this test
		vashStatic.testable.suppressWarnings(false);
		
		var contents = fixLineReturns( fun(originalForEachNested2) )
		//console.log("contents", contents)

		// fs.outputFileSync( TEMP_DIR + "convertForEach/foreach-nested-2.vash", contents );
		// expect(contents).toContain('@Html.foreach(list, function(item) {\n\tstuff @item stuff\n\tstuff @item stuff\n})')
		
		tryToCompile(contents)

		// suppresses warnings and logs again
		vashStatic.testable.suppressWarnings(true);
	})
})


describe("convertStringHelpers", function() {
	var fun = vashStatic.testable.convertStringHelpers

	it("should convert string helpers to vash versions", function(){
		expect(fun("string.IsNullOrWhiteSpace")).toBe("Html.StringIsNullOrWhiteSpace")
		expect(fun("String.IsNullOrWhiteSpace")).toBe("Html.StringIsNullOrWhiteSpace")
		expect(fun("string.IsNullOrEmpty")).toBe("Html.StringIsNullOrEmpty")
		expect(fun("String.IsNullOrEmpty")).toBe("Html.StringIsNullOrEmpty")
	})
})

describe("closeTemplateBraces", function() {
	var fun = vashStatic.testable.closeTemplateBraces
	  , CLOSE_SNIPPET = "++CLOSE_SPECIAL++"

	it("should substitute the closing brace with the snippet when no nested braces exist", function(){
		var result = fun("stuff }", CLOSE_SNIPPET, true);
		expect(result).toBe("stuff " + CLOSE_SNIPPET)
	})
	
	// Note, this behaviour is expected, but would probably not be used in the real world
	it("should fail to substitute the closing brace with the snippet (when no nested braces exist and 'useCloseSnippet' is false)", function(){
		var result = fun("stuff }", CLOSE_SNIPPET);
		expect(result).toBe("stuff }")
	})


	it("should substitute only the relevant closing brace with the snippet when nested braces do exist", function(){
		var result = fun("stuff @if(a){b=c;} }", CLOSE_SNIPPET);
		expect(result).toBe("stuff @if(a){b=c;} " + CLOSE_SNIPPET)
	})

	// Note, this behaviour is expected, but would probably not be used in the real world
	it("should substitute all closing braces with the snippet when nested braces do exist", function(){
		var result = fun("stuff @if(a){b=c;} }", CLOSE_SNIPPET, true);
		expect(result).toBe("stuff @if(a){b=c;"+ CLOSE_SNIPPET + " " + CLOSE_SNIPPET)
	})
})



describe("replaceAllButLast", function() {
	var fun = vashStatic.testable.replaceAllButLast

	it("should replace all cases of 'giraffe' in string with 'monkey'.", function(){
		expect(fun("I am a giraffe-sized giraffe from giraffe land", 'giraffe', 'monkey')).toBe("I am a monkey-sized monkey from giraffe land")
	})
})

/*
describe("XXXXX", function() {
	var fun = vashStatic.testable.XXXXX

	it("should ", function(){
		expect(fun("XXXXXX")).toBe("XXX")
	})
})
*/

// utils

// Some code editors use '\r' and even '\r\n', so this sanitizes that to just single '\n'
function fixLineReturns(tmpl) {
	return tmpl.split("\r\n").join("\n").split("\r").join("\n");
}

// attempts to compile the given vash template string and fails test if there's an error
function tryToCompile(contents) {
	vashStatic.testable.setCustomHelpers();

	var precompiled = vashStatic.testable.compileTemplate(contents);
	var hasErr = false;
	
	try {
		precompiled({});
	} catch(err) {
		console.log(err)
		hasErr = true;
	}

	expect(hasErr).toBe(false)
}

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

	var fun = vashStatic.testable.normalizeRazorSyntax
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
	  , dest = TEMP_DIR + "normalizeTemplate/simple.cshtml"
	  , originalContents = fs.readFileSync(tmplPath).toString()
	  , normalizedContents = vashStatic.testable.normalizeRazorSyntax(originalContents)

	it("should read a template from file system, then save it to the destination file path and pass the same contents to the callback", function(done) {
		fun(tmplPath, dest, null, function(contents) {
			expect(contents).toBe(fs.readFileSync(dest).toString())
			done()
		})
	})
	
	it("should pass in template contents and expect it to be 'normalized' in the destination output", function(done) {
		fun(null, dest, originalContents, function(contents) {
			expect(contents).not.toBe(originalContents)
			expect(contents).toBe(normalizedContents)
			done()
		})
	})
	
	it("should still return contents if 'dest' is not given", function(done) {
		fun(tmplPath, null, null, function(contents) {
			expect(contents).toBe(normalizedContents)
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

/*
describe("XXXXX", function() {
	var fun = vashStatic.testable.XXXXX

	it("should ", function(){
		expect(fun("XXXXXX")).toBe("XXX")
	})
})
*/
var gulp = require('gulp')
  , jshint = require('gulp-jshint')
  , stylish = require('jshint-stylish')
  , jasmine = require('gulp-jasmine')

gulp.task('lint', function () {
  return gulp.src(['**/*.js', '!node_modules{,/**}']).pipe(jshint()).pipe(jshint.reporter(stylish))
})


gulp.task('test', function() {
	return gulp.src('spec/unit.js')
		.pipe(jasmine())
})

gulp.task('default', ['lint', 'test'])

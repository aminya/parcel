const {Transform} = require('stream');
const babel = require('gulp-babel');
const gulp = require('gulp');
const path = require('path');
const rimraf = require('rimraf');
const babelConfig = require('./babel.config.json');
const {execSync} = require('child_process');

const IGNORED_PACKAGES = [
  '!packages/examples/**',
  '!packages/core/integration-tests/**',
  '!packages/core/workers/test/integration/**',
  '!packages/core/is-v2-ready-yet/**',
  '!packages/core/test-utils/**',
  '!packages/core/types/**',
  '!packages/utils/node-libs-browser/**',
];

const paths = {
  packageSrc: [
    'packages/*/*/src/**/*.js',
    '!packages/*/scope-hoisting/src/helpers.js',
    '!**/loaders/**',
    '!**/prelude.js',
    '!**/dev-prelude.js',
    ...IGNORED_PACKAGES,
  ],
  packageOther: [
    'packages/*/scope-hoisting/src/helpers.js',
    'packages/*/*/src/**/loaders/**',
    'packages/*/*/src/**/prelude.js',
    'packages/*/*/src/**/dev-prelude.js',
    'packages/*/dev-server/src/templates/**',
  ],
  packageJson: [
    'packages/core/parcel/package.json',
    'packages/utils/create-react-app/package.json',
  ],
  packages: 'packages/',
};

/*
 * "Taps" into the contents of a flowing stream, yielding chunks to the passed
 * callback. Continues to pass data chunks down the stream.
 */
class TapStream extends Transform {
  constructor(tap, options) {
    super({...options, objectMode: true});
    this._tap = tap;
  }

  _transform(chunk, encoding, callback) {
    try {
      this._tap(chunk);
      callback(null, chunk);
    } catch (err) {
      callback(err);
    }
  }
}

exports.clean = function clean(cb) {
  rimraf('packages/*/*/lib/**', cb);
};

exports.default = exports.build = gulp.series(
  gulp.parallel(buildBabel, copyOthers),
  // Babel reads from package.json so update these after babel has run
  paths.packageJson.map(
    packageJsonPath =>
      function updatePackageJson() {
        return _updatePackageJson(packageJsonPath);
      },
  ),
);

exports.bundle = gulp.series(bundleBuild);

function buildBabel() {
  return gulp
    .src(paths.packageSrc)
    .pipe(babel(babelConfig))
    .pipe(renameStream(relative => relative.replace('src', 'lib')))
    .pipe(gulp.dest(paths.packages));
}

function copyOthers() {
  return gulp
    .src(paths.packageOther)
    .pipe(renameStream(relative => relative.replace('src', 'lib')))
    .pipe(gulp.dest(paths.packages));
}

function _updatePackageJson(file) {
  return gulp
    .src(file)
    .pipe(
      new TapStream(vinyl => {
        let json = JSON.parse(vinyl.contents);
        // Replace all references to `src` in package.json bin entries
        // `lib` equivalents.
        if (typeof json.bin === 'object' && json.bin != null) {
          for (let [binName, binPath] of Object.entries(json.bin)) {
            json.bin[binName] = binPath.replace('src', 'lib');
          }
        } else if (typeof json.bin === 'string') {
          json.bin = json.bin.replace('src', 'lib');
        }

        vinyl.contents = Buffer.from(JSON.stringify(json, null, 2));
      }),
    )
    .pipe(gulp.dest(path.dirname(file)));
}

function renameStream(fn) {
  return new TapStream(vinyl => {
    let relative = path.relative(vinyl.base, vinyl.path);
    vinyl.path = path.join(vinyl.base, fn(relative));
  });
}

function bundleBuild(done) {
  if (process.env.PARCEL_BUILD_ENV == 'production') {
    // link current parcel binary to node_modules
    execSync('yarn link', {cwd: 'packages/core/parcel', stdio: 'inherit'});
    // bundle packages
    const packagesCustomBuild = ['packages/core/parcel'];
    for (const pack of packagesCustomBuild) {
      execSync('yarn bundle', {cwd: pack, stdio: 'inherit'});
    }
  }
  done();
}

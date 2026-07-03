var e=Object.create,t=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,i=Object.getPrototypeOf,a=Object.prototype.hasOwnProperty,o=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t),e=null),t.exports),s=(e,i,o,s)=>{if(i&&typeof i==`object`||typeof i==`function`)for(var c=r(i),l=0,u=c.length,d;l<u;l++)d=c[l],!a.call(e,d)&&d!==o&&t(e,d,{get:(e=>i[e]).bind(null,d),enumerable:!(s=n(i,d))||s.enumerable});return e},c=(n,r,a)=>(a=n==null?{}:e(i(n)),s(r||!n||!n.__esModule?t(a,`default`,{value:n,enumerable:!0}):a,n)),l=(e=>typeof require<`u`?require:typeof Proxy<`u`?new Proxy(e,{get:(e,t)=>(typeof require<`u`?require:e)[t]}):e)(function(e){if(typeof require<`u`)return require.apply(this,arguments);throw Error('Calling `require` for "'+e+"\" in an environment that doesn't expose the `require` function. See https://rolldown.rs/in-depth/bundling-cjs#require-external-modules for more details.")});(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var u=o(((e,t)=>{(function(n,r){typeof e==`object`&&t!==void 0?t.exports=r():typeof define==`function`&&define.amd?define(r):(n||=self,n.AMapLoader=r())})(e,function(){function e(e){var r=[];return e.AMapUI&&r.push(t(e.AMapUI)),e.Loca&&r.push(n(e.Loca)),Promise.all(r)}function t(e){return new Promise(function(t,n){var s=[];if(e.plugins)for(var c=0;c<e.plugins.length;c+=1)i.AMapUI.plugins.indexOf(e.plugins[c])==-1&&s.push(e.plugins[c]);if(a.AMapUI===r.failed)n(`前次请求 AMapUI 失败`);else if(a.AMapUI===r.notload){a.AMapUI=r.loading,i.AMapUI.version=e.version||i.AMapUI.version,c=i.AMapUI.version;var l=document.body||document.head,u=document.createElement(`script`);u.type=`text/javascript`,u.src=`https://webapi.amap.com/ui/`+c+`/main.js`,u.onerror=function(e){a.AMapUI=r.failed,n(`请求 AMapUI 失败`)},u.onload=function(){if(a.AMapUI=r.loaded,s.length)window.AMapUI.loadUI(s,function(){for(var e=0,n=s.length;e<n;e++){var r=s[e].split(`/`).slice(-1)[0];window.AMapUI[r]=arguments[e]}for(t();o.AMapUI.length;)o.AMapUI.splice(0,1)[0]()});else for(t();o.AMapUI.length;)o.AMapUI.splice(0,1)[0]()},l.appendChild(u)}else a.AMapUI===r.loaded?e.version&&e.version!==i.AMapUI.version?n(`不允许多个版本 AMapUI 混用`):s.length?window.AMapUI.loadUI(s,function(){for(var e=0,n=s.length;e<n;e++){var r=s[e].split(`/`).slice(-1)[0];window.AMapUI[r]=arguments[e]}t()}):t():e.version&&e.version!==i.AMapUI.version?n(`不允许多个版本 AMapUI 混用`):o.AMapUI.push(function(e){e?n(e):s.length?window.AMapUI.loadUI(s,function(){for(var e=0,n=s.length;e<n;e++){var r=s[e].split(`/`).slice(-1)[0];window.AMapUI[r]=arguments[e]}t()}):t()})})}function n(e){return new Promise(function(t,n){if(a.Loca===r.failed)n(`前次请求 Loca 失败`);else if(a.Loca===r.notload){a.Loca=r.loading,i.Loca.version=e.version||i.Loca.version;var s=i.Loca.version,c=i.AMap.version.startsWith(`2`),l=s.startsWith(`2`);if(c&&!l||!c&&l)n(`JSAPI 与 Loca 版本不对应！！`);else{c=i.key,l=document.body||document.head;var u=document.createElement(`script`);u.type=`text/javascript`,u.src=`https://webapi.amap.com/loca?v=`+s+`&key=`+c,u.onerror=function(e){a.Loca=r.failed,n(`请求 AMapUI 失败`)},u.onload=function(){for(a.Loca=r.loaded,t();o.Loca.length;)o.Loca.splice(0,1)[0]()},l.appendChild(u)}}else a.Loca===r.loaded?e.version&&e.version!==i.Loca.version?n(`不允许多个版本 Loca 混用`):t():e.version&&e.version!==i.Loca.version?n(`不允许多个版本 Loca 混用`):o.Loca.push(function(e){e?n(e):n()})})}if(!window)throw Error(`AMap JSAPI can only be used in Browser.`);var r;(function(e){e.notload=`notload`,e.loading=`loading`,e.loaded=`loaded`,e.failed=`failed`})(r||={});var i={key:``,AMap:{version:`1.4.15`,plugins:[]},AMapUI:{version:`1.1`,plugins:[]},Loca:{version:`1.3.2`}},a={AMap:r.notload,AMapUI:r.notload,Loca:r.notload},o={AMap:[],AMapUI:[],Loca:[]},s=[],c=function(e){typeof e==`function`&&(a.AMap===r.loaded?e(window.AMap):s.push(e))};return{load:function(t){return new Promise(function(n,o){if(a.AMap==r.failed)o(``);else if(a.AMap==r.notload){var l=t.key,u=t.version,d=t.plugins;l?(window.AMap&&location.host!==`lbs.amap.com`&&o(`禁止多种API加载方式混用`),i.key=l,i.AMap.version=u||i.AMap.version,i.AMap.plugins=d||i.AMap.plugins,a.AMap=r.loading,u=document.body||document.head,window.___onAPILoaded=function(i){if(delete window.___onAPILoaded,i)a.AMap=r.failed,o(i);else for(a.AMap=r.loaded,e(t).then(function(){n(window.AMap)}).catch(o);s.length;)s.splice(0,1)[0]()},d=document.createElement(`script`),d.type=`text/javascript`,d.src=`https://webapi.amap.com/maps?callback=___onAPILoaded&v=`+i.AMap.version+`&key=`+l+`&plugin=`+i.AMap.plugins.join(`,`),d.onerror=function(e){a.AMap=r.failed,o(e)},u.appendChild(d)):o(`请填写key`)}else if(a.AMap==r.loaded)if(t.key&&t.key!==i.key)o(`多个不一致的 key`);else if(t.version&&t.version!==i.AMap.version)o(`不允许多个版本 JSAPI 混用`);else{if(l=[],t.plugins)for(u=0;u<t.plugins.length;u+=1)i.AMap.plugins.indexOf(t.plugins[u])==-1&&l.push(t.plugins[u]);l.length?window.AMap.plugin(l,function(){e(t).then(function(){n(window.AMap)}).catch(o)}):e(t).then(function(){n(window.AMap)}).catch(o)}else if(t.key&&t.key!==i.key)o(`多个不一致的 key`);else if(t.version&&t.version!==i.AMap.version)o(`不允许多个版本 JSAPI 混用`);else{var f=[];if(t.plugins)for(u=0;u<t.plugins.length;u+=1)i.AMap.plugins.indexOf(t.plugins[u])==-1&&f.push(t.plugins[u]);c(function(){f.length?window.AMap.plugin(f,function(){e(t).then(function(){n(window.AMap)}).catch(o)}):e(t).then(function(){n(window.AMap)}).catch(o)})}})},reset:function(){delete window.AMap,delete window.AMapUI,delete window.Loca,i={key:``,AMap:{version:`1.4.15`,plugins:[]},AMapUI:{version:`1.1`,plugins:[]},Loca:{version:`1.3.2`}},a={AMap:r.notload,AMapUI:r.notload,Loca:r.notload},o={AMap:[],AMapUI:[],Loca:[]}}}})})),d=o(((e,t)=>{(function(n,r){typeof e==`object`&&t!==void 0?r(e):typeof define==`function`&&define.amd?define([`exports`],r):(n=typeof globalThis<`u`?globalThis:n||self,r(n.leaflet={}))})(e,(function(e){var t=`1.9.4`;function n(e){var t,n,r,i;for(n=1,r=arguments.length;n<r;n++)for(t in i=arguments[n],i)e[t]=i[t];return e}var r=Object.create||(function(){function e(){}return function(t){return e.prototype=t,new e}})();function i(e,t){var n=Array.prototype.slice;if(e.bind)return e.bind.apply(e,n.call(arguments,1));var r=n.call(arguments,2);return function(){return e.apply(t,r.length?r.concat(n.call(arguments)):arguments)}}var a=0;function o(e){return`_leaflet_id`in e||(e._leaflet_id=++a),e._leaflet_id}function s(e,t,n){var r,i,a,o=function(){r=!1,i&&=(a.apply(n,i),!1)};return a=function(){r?i=arguments:(e.apply(n,arguments),setTimeout(o,t),r=!0)},a}function c(e,t,n){var r=t[1],i=t[0],a=r-i;return e===r&&n?e:((e-i)%a+a)%a+i}function l(){return!1}function u(e,t){if(t===!1)return e;var n=10**(t===void 0?6:t);return Math.round(e*n)/n}function d(e){return e.trim?e.trim():e.replace(/^\s+|\s+$/g,``)}function f(e){return d(e).split(/\s+/)}function p(e,t){for(var n in Object.prototype.hasOwnProperty.call(e,`options`)||(e.options=e.options?r(e.options):{}),t)e.options[n]=t[n];return e.options}function m(e,t,n){var r=[];for(var i in e)r.push(encodeURIComponent(n?i.toUpperCase():i)+`=`+encodeURIComponent(e[i]));return(!t||t.indexOf(`?`)===-1?`?`:`&`)+r.join(`&`)}var ee=/\{ *([\w_ -]+) *\}/g;function h(e,t){return e.replace(ee,function(e,n){var r=t[n];if(r===void 0)throw Error(`No value provided for variable `+e);return typeof r==`function`&&(r=r(t)),r})}var g=Array.isArray||function(e){return Object.prototype.toString.call(e)===`[object Array]`};function te(e,t){for(var n=0;n<e.length;n++)if(e[n]===t)return n;return-1}var ne=`data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=`;function re(e){return window[`webkit`+e]||window[`moz`+e]||window[`ms`+e]}var ie=0;function ae(e){var t=+new Date,n=Math.max(0,16-(t-ie));return ie=t+n,window.setTimeout(e,n)}var oe=window.requestAnimationFrame||re(`RequestAnimationFrame`)||ae,se=window.cancelAnimationFrame||re(`CancelAnimationFrame`)||re(`CancelRequestAnimationFrame`)||function(e){window.clearTimeout(e)};function _(e,t,n){if(n&&oe===ae)e.call(t);else return oe.call(window,i(e,t))}function v(e){e&&se.call(window,e)}var ce={__proto__:null,extend:n,create:r,bind:i,get lastId(){return a},stamp:o,throttle:s,wrapNum:c,falseFn:l,formatNum:u,trim:d,splitWords:f,setOptions:p,getParamString:m,template:h,isArray:g,indexOf:te,emptyImageUrl:ne,requestFn:oe,cancelFn:se,requestAnimFrame:_,cancelAnimFrame:v};function y(){}y.extend=function(e){var t=function(){p(this),this.initialize&&this.initialize.apply(this,arguments),this.callInitHooks()},i=t.__super__=this.prototype,a=r(i);for(var o in a.constructor=t,t.prototype=a,this)Object.prototype.hasOwnProperty.call(this,o)&&o!==`prototype`&&o!==`__super__`&&(t[o]=this[o]);return e.statics&&n(t,e.statics),e.includes&&(le(e.includes),n.apply(null,[a].concat(e.includes))),n(a,e),delete a.statics,delete a.includes,a.options&&(a.options=i.options?r(i.options):{},n(a.options,e.options)),a._initHooks=[],a.callInitHooks=function(){if(!this._initHooksCalled){i.callInitHooks&&i.callInitHooks.call(this),this._initHooksCalled=!0;for(var e=0,t=a._initHooks.length;e<t;e++)a._initHooks[e].call(this)}},t},y.include=function(e){var t=this.prototype.options;return n(this.prototype,e),e.options&&(this.prototype.options=t,this.mergeOptions(e.options)),this},y.mergeOptions=function(e){return n(this.prototype.options,e),this},y.addInitHook=function(e){var t=Array.prototype.slice.call(arguments,1),n=typeof e==`function`?e:function(){this[e].apply(this,t)};return this.prototype._initHooks=this.prototype._initHooks||[],this.prototype._initHooks.push(n),this};function le(e){if(!(typeof L>`u`||!L||!L.Mixin)){e=g(e)?e:[e];for(var t=0;t<e.length;t++)e[t]===L.Mixin.Events&&console.warn(`Deprecated include of L.Mixin.Events: this property will be removed in future releases, please inherit from L.Evented instead.`,Error().stack)}}var b={on:function(e,t,n){if(typeof e==`object`)for(var r in e)this._on(r,e[r],t);else{e=f(e);for(var i=0,a=e.length;i<a;i++)this._on(e[i],t,n)}return this},off:function(e,t,n){if(!arguments.length)delete this._events;else if(typeof e==`object`)for(var r in e)this._off(r,e[r],t);else{e=f(e);for(var i=arguments.length===1,a=0,o=e.length;a<o;a++)i?this._off(e[a]):this._off(e[a],t,n)}return this},_on:function(e,t,n,r){if(typeof t!=`function`){console.warn(`wrong listener type: `+typeof t);return}if(this._listens(e,t,n)===!1){n===this&&(n=void 0);var i={fn:t,ctx:n};r&&(i.once=!0),this._events=this._events||{},this._events[e]=this._events[e]||[],this._events[e].push(i)}},_off:function(e,t,n){var r,i,a;if(this._events&&(r=this._events[e],r)){if(arguments.length===1){if(this._firingCount)for(i=0,a=r.length;i<a;i++)r[i].fn=l;delete this._events[e];return}if(typeof t!=`function`){console.warn(`wrong listener type: `+typeof t);return}var o=this._listens(e,t,n);if(o!==!1){var s=r[o];this._firingCount&&(s.fn=l,this._events[e]=r=r.slice()),r.splice(o,1)}}},fire:function(e,t,r){if(!this.listens(e,r))return this;var i=n({},t,{type:e,target:this,sourceTarget:t&&t.sourceTarget||this});if(this._events){var a=this._events[e];if(a){this._firingCount=this._firingCount+1||1;for(var o=0,s=a.length;o<s;o++){var c=a[o],l=c.fn;c.once&&this.off(e,l,c.ctx),l.call(c.ctx||this,i)}this._firingCount--}}return r&&this._propagateEvent(i),this},listens:function(e,t,n,r){typeof e!=`string`&&console.warn(`"string" type argument expected`);var i=t;typeof t!=`function`&&(r=!!t,i=void 0,n=void 0);var a=this._events&&this._events[e];if(a&&a.length&&this._listens(e,i,n)!==!1)return!0;if(r){for(var o in this._eventParents)if(this._eventParents[o].listens(e,t,n,r))return!0}return!1},_listens:function(e,t,n){if(!this._events)return!1;var r=this._events[e]||[];if(!t)return!!r.length;n===this&&(n=void 0);for(var i=0,a=r.length;i<a;i++)if(r[i].fn===t&&r[i].ctx===n)return i;return!1},once:function(e,t,n){if(typeof e==`object`)for(var r in e)this._on(r,e[r],t,!0);else{e=f(e);for(var i=0,a=e.length;i<a;i++)this._on(e[i],t,n,!0)}return this},addEventParent:function(e){return this._eventParents=this._eventParents||{},this._eventParents[o(e)]=e,this},removeEventParent:function(e){return this._eventParents&&delete this._eventParents[o(e)],this},_propagateEvent:function(e){for(var t in this._eventParents)this._eventParents[t].fire(e.type,n({layer:e.target,propagatedFrom:e.target},e),!0)}};b.addEventListener=b.on,b.removeEventListener=b.clearAllEventListeners=b.off,b.addOneTimeEventListener=b.once,b.fireEvent=b.fire,b.hasEventListeners=b.listens;var ue=y.extend(b);function x(e,t,n){this.x=n?Math.round(e):e,this.y=n?Math.round(t):t}var de=Math.trunc||function(e){return e>0?Math.floor(e):Math.ceil(e)};x.prototype={clone:function(){return new x(this.x,this.y)},add:function(e){return this.clone()._add(S(e))},_add:function(e){return this.x+=e.x,this.y+=e.y,this},subtract:function(e){return this.clone()._subtract(S(e))},_subtract:function(e){return this.x-=e.x,this.y-=e.y,this},divideBy:function(e){return this.clone()._divideBy(e)},_divideBy:function(e){return this.x/=e,this.y/=e,this},multiplyBy:function(e){return this.clone()._multiplyBy(e)},_multiplyBy:function(e){return this.x*=e,this.y*=e,this},scaleBy:function(e){return new x(this.x*e.x,this.y*e.y)},unscaleBy:function(e){return new x(this.x/e.x,this.y/e.y)},round:function(){return this.clone()._round()},_round:function(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this},floor:function(){return this.clone()._floor()},_floor:function(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this},ceil:function(){return this.clone()._ceil()},_ceil:function(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this},trunc:function(){return this.clone()._trunc()},_trunc:function(){return this.x=de(this.x),this.y=de(this.y),this},distanceTo:function(e){e=S(e);var t=e.x-this.x,n=e.y-this.y;return Math.sqrt(t*t+n*n)},equals:function(e){return e=S(e),e.x===this.x&&e.y===this.y},contains:function(e){return e=S(e),Math.abs(e.x)<=Math.abs(this.x)&&Math.abs(e.y)<=Math.abs(this.y)},toString:function(){return`Point(`+u(this.x)+`, `+u(this.y)+`)`}};function S(e,t,n){return e instanceof x?e:g(e)?new x(e[0],e[1]):e==null?e:typeof e==`object`&&`x`in e&&`y`in e?new x(e.x,e.y):new x(e,t,n)}function C(e,t){if(e)for(var n=t?[e,t]:e,r=0,i=n.length;r<i;r++)this.extend(n[r])}C.prototype={extend:function(e){var t,n;if(!e)return this;if(e instanceof x||typeof e[0]==`number`||`x`in e)t=n=S(e);else if(e=w(e),t=e.min,n=e.max,!t||!n)return this;return!this.min&&!this.max?(this.min=t.clone(),this.max=n.clone()):(this.min.x=Math.min(t.x,this.min.x),this.max.x=Math.max(n.x,this.max.x),this.min.y=Math.min(t.y,this.min.y),this.max.y=Math.max(n.y,this.max.y)),this},getCenter:function(e){return S((this.min.x+this.max.x)/2,(this.min.y+this.max.y)/2,e)},getBottomLeft:function(){return S(this.min.x,this.max.y)},getTopRight:function(){return S(this.max.x,this.min.y)},getTopLeft:function(){return this.min},getBottomRight:function(){return this.max},getSize:function(){return this.max.subtract(this.min)},contains:function(e){var t,n;return e=typeof e[0]==`number`||e instanceof x?S(e):w(e),e instanceof C?(t=e.min,n=e.max):t=n=e,t.x>=this.min.x&&n.x<=this.max.x&&t.y>=this.min.y&&n.y<=this.max.y},intersects:function(e){e=w(e);var t=this.min,n=this.max,r=e.min,i=e.max,a=i.x>=t.x&&r.x<=n.x,o=i.y>=t.y&&r.y<=n.y;return a&&o},overlaps:function(e){e=w(e);var t=this.min,n=this.max,r=e.min,i=e.max,a=i.x>t.x&&r.x<n.x,o=i.y>t.y&&r.y<n.y;return a&&o},isValid:function(){return!!(this.min&&this.max)},pad:function(e){var t=this.min,n=this.max,r=Math.abs(t.x-n.x)*e,i=Math.abs(t.y-n.y)*e;return w(S(t.x-r,t.y-i),S(n.x+r,n.y+i))},equals:function(e){return e?(e=w(e),this.min.equals(e.getTopLeft())&&this.max.equals(e.getBottomRight())):!1}};function w(e,t){return!e||e instanceof C?e:new C(e,t)}function T(e,t){if(e)for(var n=t?[e,t]:e,r=0,i=n.length;r<i;r++)this.extend(n[r])}T.prototype={extend:function(e){var t=this._southWest,n=this._northEast,r,i;if(e instanceof D)r=e,i=e;else if(e instanceof T){if(r=e._southWest,i=e._northEast,!r||!i)return this}else return e?this.extend(O(e)||E(e)):this;return!t&&!n?(this._southWest=new D(r.lat,r.lng),this._northEast=new D(i.lat,i.lng)):(t.lat=Math.min(r.lat,t.lat),t.lng=Math.min(r.lng,t.lng),n.lat=Math.max(i.lat,n.lat),n.lng=Math.max(i.lng,n.lng)),this},pad:function(e){var t=this._southWest,n=this._northEast,r=Math.abs(t.lat-n.lat)*e,i=Math.abs(t.lng-n.lng)*e;return new T(new D(t.lat-r,t.lng-i),new D(n.lat+r,n.lng+i))},getCenter:function(){return new D((this._southWest.lat+this._northEast.lat)/2,(this._southWest.lng+this._northEast.lng)/2)},getSouthWest:function(){return this._southWest},getNorthEast:function(){return this._northEast},getNorthWest:function(){return new D(this.getNorth(),this.getWest())},getSouthEast:function(){return new D(this.getSouth(),this.getEast())},getWest:function(){return this._southWest.lng},getSouth:function(){return this._southWest.lat},getEast:function(){return this._northEast.lng},getNorth:function(){return this._northEast.lat},contains:function(e){e=typeof e[0]==`number`||e instanceof D||`lat`in e?O(e):E(e);var t=this._southWest,n=this._northEast,r,i;return e instanceof T?(r=e.getSouthWest(),i=e.getNorthEast()):r=i=e,r.lat>=t.lat&&i.lat<=n.lat&&r.lng>=t.lng&&i.lng<=n.lng},intersects:function(e){e=E(e);var t=this._southWest,n=this._northEast,r=e.getSouthWest(),i=e.getNorthEast(),a=i.lat>=t.lat&&r.lat<=n.lat,o=i.lng>=t.lng&&r.lng<=n.lng;return a&&o},overlaps:function(e){e=E(e);var t=this._southWest,n=this._northEast,r=e.getSouthWest(),i=e.getNorthEast(),a=i.lat>t.lat&&r.lat<n.lat,o=i.lng>t.lng&&r.lng<n.lng;return a&&o},toBBoxString:function(){return[this.getWest(),this.getSouth(),this.getEast(),this.getNorth()].join(`,`)},equals:function(e,t){return e?(e=E(e),this._southWest.equals(e.getSouthWest(),t)&&this._northEast.equals(e.getNorthEast(),t)):!1},isValid:function(){return!!(this._southWest&&this._northEast)}};function E(e,t){return e instanceof T?e:new T(e,t)}function D(e,t,n){if(isNaN(e)||isNaN(t))throw Error(`Invalid LatLng object: (`+e+`, `+t+`)`);this.lat=+e,this.lng=+t,n!==void 0&&(this.alt=+n)}D.prototype={equals:function(e,t){return e?(e=O(e),Math.max(Math.abs(this.lat-e.lat),Math.abs(this.lng-e.lng))<=(t===void 0?1e-9:t)):!1},toString:function(e){return`LatLng(`+u(this.lat,e)+`, `+u(this.lng,e)+`)`},distanceTo:function(e){return pe.distance(this,O(e))},wrap:function(){return pe.wrapLatLng(this)},toBounds:function(e){var t=180*e/40075017,n=t/Math.cos(Math.PI/180*this.lat);return E([this.lat-t,this.lng-n],[this.lat+t,this.lng+n])},clone:function(){return new D(this.lat,this.lng,this.alt)}};function O(e,t,n){return e instanceof D?e:g(e)&&typeof e[0]!=`object`?e.length===3?new D(e[0],e[1],e[2]):e.length===2?new D(e[0],e[1]):null:e==null?e:typeof e==`object`&&`lat`in e?new D(e.lat,`lng`in e?e.lng:e.lon,e.alt):t===void 0?null:new D(e,t,n)}var fe={latLngToPoint:function(e,t){var n=this.projection.project(e),r=this.scale(t);return this.transformation._transform(n,r)},pointToLatLng:function(e,t){var n=this.scale(t),r=this.transformation.untransform(e,n);return this.projection.unproject(r)},project:function(e){return this.projection.project(e)},unproject:function(e){return this.projection.unproject(e)},scale:function(e){return 256*2**e},zoom:function(e){return Math.log(e/256)/Math.LN2},getProjectedBounds:function(e){if(this.infinite)return null;var t=this.projection.bounds,n=this.scale(e);return new C(this.transformation.transform(t.min,n),this.transformation.transform(t.max,n))},infinite:!1,wrapLatLng:function(e){var t=this.wrapLng?c(e.lng,this.wrapLng,!0):e.lng,n=this.wrapLat?c(e.lat,this.wrapLat,!0):e.lat,r=e.alt;return new D(n,t,r)},wrapLatLngBounds:function(e){var t=e.getCenter(),n=this.wrapLatLng(t),r=t.lat-n.lat,i=t.lng-n.lng;if(r===0&&i===0)return e;var a=e.getSouthWest(),o=e.getNorthEast();return new T(new D(a.lat-r,a.lng-i),new D(o.lat-r,o.lng-i))}},pe=n({},fe,{wrapLng:[-180,180],R:6371e3,distance:function(e,t){var n=Math.PI/180,r=e.lat*n,i=t.lat*n,a=Math.sin((t.lat-e.lat)*n/2),o=Math.sin((t.lng-e.lng)*n/2),s=a*a+Math.cos(r)*Math.cos(i)*o*o,c=2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));return this.R*c}}),me=6378137,he={R:me,MAX_LATITUDE:85.0511287798,project:function(e){var t=Math.PI/180,n=this.MAX_LATITUDE,r=Math.max(Math.min(n,e.lat),-n),i=Math.sin(r*t);return new x(this.R*e.lng*t,this.R*Math.log((1+i)/(1-i))/2)},unproject:function(e){var t=180/Math.PI;return new D((2*Math.atan(Math.exp(e.y/this.R))-Math.PI/2)*t,e.x*t/this.R)},bounds:(function(){var e=me*Math.PI;return new C([-e,-e],[e,e])})()};function ge(e,t,n,r){if(g(e)){this._a=e[0],this._b=e[1],this._c=e[2],this._d=e[3];return}this._a=e,this._b=t,this._c=n,this._d=r}ge.prototype={transform:function(e,t){return this._transform(e.clone(),t)},_transform:function(e,t){return t||=1,e.x=t*(this._a*e.x+this._b),e.y=t*(this._c*e.y+this._d),e},untransform:function(e,t){return t||=1,new x((e.x/t-this._b)/this._a,(e.y/t-this._d)/this._c)}};function _e(e,t,n,r){return new ge(e,t,n,r)}var ve=n({},pe,{code:`EPSG:3857`,projection:he,transformation:function(){var e=.5/(Math.PI*he.R);return _e(e,.5,-e,.5)}()}),ye=n({},ve,{code:`EPSG:900913`});function k(e){return document.createElementNS(`http://www.w3.org/2000/svg`,e)}function be(e,t){var n=``,r,i,a,o,s,c;for(r=0,a=e.length;r<a;r++){for(s=e[r],i=0,o=s.length;i<o;i++)c=s[i],n+=(i?`L`:`M`)+c.x+` `+c.y;n+=t?M.svg?`z`:`x`:``}return n||`M0 0`}var xe=document.documentElement.style,A=`ActiveXObject`in window,Se=A&&!document.addEventListener,Ce=`msLaunchUri`in navigator&&!(`documentMode`in document),we=nt(`webkit`),Te=nt(`android`),Ee=nt(`android 2`)||nt(`android 3`),j=parseInt(/WebKit\/([0-9]+)|$/.exec(navigator.userAgent)[1],10),De=Te&&nt(`Google`)&&j<537&&!(`AudioNode`in window),Oe=!!window.opera,ke=!Ce&&nt(`chrome`),Ae=nt(`gecko`)&&!we&&!Oe&&!A,je=!ke&&nt(`safari`),Me=nt(`phantom`),Ne=`OTransition`in xe,Pe=navigator.platform.indexOf(`Win`)===0,Fe=A&&`transition`in xe,Ie=`WebKitCSSMatrix`in window&&`m11`in new window.WebKitCSSMatrix&&!Ee,Le=`MozPerspective`in xe,Re=!window.L_DISABLE_3D&&(Fe||Ie||Le)&&!Ne&&!Me,ze=typeof orientation<`u`||nt(`mobile`),Be=ze&&we,Ve=ze&&Ie,He=!window.PointerEvent&&window.MSPointerEvent,Ue=!!(window.PointerEvent||He),We=`ontouchstart`in window||!!window.TouchEvent,Ge=!window.L_NO_TOUCH&&(We||Ue),Ke=ze&&Oe,qe=ze&&Ae,Je=(window.devicePixelRatio||window.screen.deviceXDPI/window.screen.logicalXDPI)>1,Ye=function(){var e=!1;try{var t=Object.defineProperty({},"passive",{get:function(){e=!0}});window.addEventListener(`testPassiveEventSupport`,l,t),window.removeEventListener(`testPassiveEventSupport`,l,t)}catch{}return e}(),Xe=function(){return!!document.createElement(`canvas`).getContext}(),Ze=!!(document.createElementNS&&k(`svg`).createSVGRect),Qe=!!Ze&&(function(){var e=document.createElement(`div`);return e.innerHTML=`<svg/>`,(e.firstChild&&e.firstChild.namespaceURI)===`http://www.w3.org/2000/svg`})(),$e=!Ze&&function(){try{var e=document.createElement(`div`);e.innerHTML=`<v:shape adj="1"/>`;var t=e.firstChild;return t.style.behavior=`url(#default#VML)`,t&&typeof t.adj==`object`}catch{return!1}}(),et=navigator.platform.indexOf(`Mac`)===0,tt=navigator.platform.indexOf(`Linux`)===0;function nt(e){return navigator.userAgent.toLowerCase().indexOf(e)>=0}var M={ie:A,ielt9:Se,edge:Ce,webkit:we,android:Te,android23:Ee,androidStock:De,opera:Oe,chrome:ke,gecko:Ae,safari:je,phantom:Me,opera12:Ne,win:Pe,ie3d:Fe,webkit3d:Ie,gecko3d:Le,any3d:Re,mobile:ze,mobileWebkit:Be,mobileWebkit3d:Ve,msPointer:He,pointer:Ue,touch:Ge,touchNative:We,mobileOpera:Ke,mobileGecko:qe,retina:Je,passiveEvents:Ye,canvas:Xe,svg:Ze,vml:$e,inlineSvg:Qe,mac:et,linux:tt},rt=M.msPointer?`MSPointerDown`:`pointerdown`,it=M.msPointer?`MSPointerMove`:`pointermove`,at=M.msPointer?`MSPointerUp`:`pointerup`,ot=M.msPointer?`MSPointerCancel`:`pointercancel`,st={touchstart:rt,touchmove:it,touchend:at,touchcancel:ot},ct={touchstart:_t,touchmove:gt,touchend:gt,touchcancel:gt},N={},lt=!1;function ut(e,t,n){return t===`touchstart`&&ht(),ct[t]?(n=ct[t].bind(this,n),e.addEventListener(st[t],n,!1),n):(console.warn(`wrong event specified:`,t),l)}function dt(e,t,n){if(!st[t]){console.warn(`wrong event specified:`,t);return}e.removeEventListener(st[t],n,!1)}function ft(e){N[e.pointerId]=e}function pt(e){N[e.pointerId]&&(N[e.pointerId]=e)}function mt(e){delete N[e.pointerId]}function ht(){lt||=(document.addEventListener(rt,ft,!0),document.addEventListener(it,pt,!0),document.addEventListener(at,mt,!0),document.addEventListener(ot,mt,!0),!0)}function gt(e,t){if(t.pointerType!==(t.MSPOINTER_TYPE_MOUSE||`mouse`)){for(var n in t.touches=[],N)t.touches.push(N[n]);t.changedTouches=[t],e(t)}}function _t(e,t){t.MSPOINTER_TYPE_TOUCH&&t.pointerType===t.MSPOINTER_TYPE_TOUCH&&G(t),gt(e,t)}function vt(e){var t={},n,r;for(r in e)n=e[r],t[r]=n&&n.bind?n.bind(e):n;return e=t,t.type=`dblclick`,t.detail=2,t.isTrusted=!1,t._simulated=!0,t}var yt=200;function bt(e,t){e.addEventListener(`dblclick`,t);var n=0,r;function i(e){if(e.detail!==1){r=e.detail;return}if(!(e.pointerType===`mouse`||e.sourceCapabilities&&!e.sourceCapabilities.firesTouchEvents)){var i=rn(e);if(!(i.some(function(e){return e instanceof HTMLLabelElement&&e.attributes.for})&&!i.some(function(e){return e instanceof HTMLInputElement||e instanceof HTMLSelectElement}))){var a=Date.now();a-n<=yt?(r++,r===2&&t(vt(e))):r=1,n=a}}}return e.addEventListener(`click`,i),{dblclick:t,simDblclick:i}}function xt(e,t){e.removeEventListener(`dblclick`,t.dblclick),e.removeEventListener(`click`,t.simDblclick)}var St=Pt([`transform`,`webkitTransform`,`OTransform`,`MozTransform`,`msTransform`]),Ct=Pt([`webkitTransition`,`transition`,`OTransition`,`MozTransition`,`msTransition`]),wt=Ct===`webkitTransition`||Ct===`OTransition`?Ct+`End`:`transitionend`;function Tt(e){return typeof e==`string`?document.getElementById(e):e}function Et(e,t){var n=e.style[t]||e.currentStyle&&e.currentStyle[t];if((!n||n===`auto`)&&document.defaultView){var r=document.defaultView.getComputedStyle(e,null);n=r?r[t]:null}return n===`auto`?null:n}function P(e,t,n){var r=document.createElement(e);return r.className=t||``,n&&n.appendChild(r),r}function F(e){var t=e.parentNode;t&&t.removeChild(e)}function Dt(e){for(;e.firstChild;)e.removeChild(e.firstChild)}function Ot(e){var t=e.parentNode;t&&t.lastChild!==e&&t.appendChild(e)}function kt(e){var t=e.parentNode;t&&t.firstChild!==e&&t.insertBefore(e,t.firstChild)}function At(e,t){if(e.classList!==void 0)return e.classList.contains(t);var n=Mt(e);return n.length>0&&RegExp(`(^|\\s)`+t+`(\\s|$)`).test(n)}function I(e,t){if(e.classList!==void 0)for(var n=f(t),r=0,i=n.length;r<i;r++)e.classList.add(n[r]);else if(!At(e,t)){var a=Mt(e);jt(e,(a?a+` `:``)+t)}}function R(e,t){e.classList===void 0?jt(e,d((` `+Mt(e)+` `).replace(` `+t+` `,` `))):e.classList.remove(t)}function jt(e,t){e.className.baseVal===void 0?e.className=t:e.className.baseVal=t}function Mt(e){return e.correspondingElement&&(e=e.correspondingElement),e.className.baseVal===void 0?e.className:e.className.baseVal}function z(e,t){`opacity`in e.style?e.style.opacity=t:`filter`in e.style&&Nt(e,t)}function Nt(e,t){var n=!1,r=`DXImageTransform.Microsoft.Alpha`;try{n=e.filters.item(r)}catch{if(t===1)return}t=Math.round(t*100),n?(n.Enabled=t!==100,n.Opacity=t):e.style.filter+=` progid:`+r+`(opacity=`+t+`)`}function Pt(e){for(var t=document.documentElement.style,n=0;n<e.length;n++)if(e[n]in t)return e[n];return!1}function Ft(e,t,n){var r=t||new x(0,0);e.style[St]=(M.ie3d?`translate(`+r.x+`px,`+r.y+`px)`:`translate3d(`+r.x+`px,`+r.y+`px,0)`)+(n?` scale(`+n+`)`:``)}function B(e,t){e._leaflet_pos=t,M.any3d?Ft(e,t):(e.style.left=t.x+`px`,e.style.top=t.y+`px`)}function It(e){return e._leaflet_pos||new x(0,0)}var Lt,Rt,zt;if(`onselectstart`in document)Lt=function(){H(window,`selectstart`,G)},Rt=function(){W(window,`selectstart`,G)};else{var Bt=Pt([`userSelect`,`WebkitUserSelect`,`OUserSelect`,`MozUserSelect`,`msUserSelect`]);Lt=function(){if(Bt){var e=document.documentElement.style;zt=e[Bt],e[Bt]=`none`}},Rt=function(){Bt&&(document.documentElement.style[Bt]=zt,zt=void 0)}}function Vt(){H(window,`dragstart`,G)}function Ht(){W(window,`dragstart`,G)}var Ut,V;function Wt(e){for(;e.tabIndex===-1;)e=e.parentNode;e.style&&(Gt(),Ut=e,V=e.style.outlineStyle,e.style.outlineStyle=`none`,H(window,`keydown`,Gt))}function Gt(){Ut&&(Ut.style.outlineStyle=V,Ut=void 0,V=void 0,W(window,`keydown`,Gt))}function Kt(e){do e=e.parentNode;while((!e.offsetWidth||!e.offsetHeight)&&e!==document.body);return e}function qt(e){var t=e.getBoundingClientRect();return{x:t.width/e.offsetWidth||1,y:t.height/e.offsetHeight||1,boundingClientRect:t}}var Jt={__proto__:null,TRANSFORM:St,TRANSITION:Ct,TRANSITION_END:wt,get:Tt,getStyle:Et,create:P,remove:F,empty:Dt,toFront:Ot,toBack:kt,hasClass:At,addClass:I,removeClass:R,setClass:jt,getClass:Mt,setOpacity:z,testProp:Pt,setTransform:Ft,setPosition:B,getPosition:It,get disableTextSelection(){return Lt},get enableTextSelection(){return Rt},disableImageDrag:Vt,enableImageDrag:Ht,preventOutline:Wt,restoreOutline:Gt,getSizedParentNode:Kt,getScale:qt};function H(e,t,n,r){if(t&&typeof t==`object`)for(var i in t)Zt(e,i,t[i],n);else{t=f(t);for(var a=0,o=t.length;a<o;a++)Zt(e,t[a],n,r)}return this}var U=`_leaflet_events`;function W(e,t,n,r){if(arguments.length===1)Yt(e),delete e[U];else if(t&&typeof t==`object`)for(var i in t)Qt(e,i,t[i],n);else if(t=f(t),arguments.length===2)Yt(e,function(e){return te(t,e)!==-1});else for(var a=0,o=t.length;a<o;a++)Qt(e,t[a],n,r);return this}function Yt(e,t){for(var n in e[U]){var r=n.split(/\d/)[0];(!t||t(r))&&Qt(e,r,null,null,n)}}var Xt={mouseenter:`mouseover`,mouseleave:`mouseout`,wheel:!(`onwheel`in window)&&`mousewheel`};function Zt(e,t,n,r){var i=t+o(n)+(r?`_`+o(r):``);if(e[U]&&e[U][i])return this;var a=function(t){return n.call(r||e,t||window.event)},s=a;!M.touchNative&&M.pointer&&t.indexOf(`touch`)===0?a=ut(e,t,a):M.touch&&t===`dblclick`?a=bt(e,a):`addEventListener`in e?t===`touchstart`||t===`touchmove`||t===`wheel`||t===`mousewheel`?e.addEventListener(Xt[t]||t,a,M.passiveEvents?{passive:!1}:!1):t===`mouseenter`||t===`mouseleave`?(a=function(t){t||=window.event,cn(e,t)&&s(t)},e.addEventListener(Xt[t],a,!1)):e.addEventListener(t,s,!1):e.attachEvent(`on`+t,a),e[U]=e[U]||{},e[U][i]=a}function Qt(e,t,n,r,i){i||=t+o(n)+(r?`_`+o(r):``);var a=e[U]&&e[U][i];if(!a)return this;!M.touchNative&&M.pointer&&t.indexOf(`touch`)===0?dt(e,t,a):M.touch&&t===`dblclick`?xt(e,a):`removeEventListener`in e?e.removeEventListener(Xt[t]||t,a,!1):e.detachEvent(`on`+t,a),e[U][i]=null}function $t(e){return e.stopPropagation?e.stopPropagation():e.originalEvent?e.originalEvent._stopped=!0:e.cancelBubble=!0,this}function en(e){return Zt(e,`wheel`,$t),this}function tn(e){return H(e,`mousedown touchstart dblclick contextmenu`,$t),e._leaflet_disable_click=!0,this}function G(e){return e.preventDefault?e.preventDefault():e.returnValue=!1,this}function nn(e){return G(e),$t(e),this}function rn(e){if(e.composedPath)return e.composedPath();for(var t=[],n=e.target;n;)t.push(n),n=n.parentNode;return t}function an(e,t){if(!t)return new x(e.clientX,e.clientY);var n=qt(t),r=n.boundingClientRect;return new x((e.clientX-r.left)/n.x-t.clientLeft,(e.clientY-r.top)/n.y-t.clientTop)}var on=M.linux&&M.chrome?window.devicePixelRatio:M.mac?window.devicePixelRatio*3:window.devicePixelRatio>0?2*window.devicePixelRatio:1;function sn(e){return M.edge?e.wheelDeltaY/2:e.deltaY&&e.deltaMode===0?-e.deltaY/on:e.deltaY&&e.deltaMode===1?-e.deltaY*20:e.deltaY&&e.deltaMode===2?-e.deltaY*60:e.deltaX||e.deltaZ?0:e.wheelDelta?(e.wheelDeltaY||e.wheelDelta)/2:e.detail&&Math.abs(e.detail)<32765?-e.detail*20:e.detail?e.detail/-32765*60:0}function cn(e,t){var n=t.relatedTarget;if(!n)return!0;try{for(;n&&n!==e;)n=n.parentNode}catch{return!1}return n!==e}var ln={__proto__:null,on:H,off:W,stopPropagation:$t,disableScrollPropagation:en,disableClickPropagation:tn,preventDefault:G,stop:nn,getPropagationPath:rn,getMousePosition:an,getWheelDelta:sn,isExternalTarget:cn,addListener:H,removeListener:W},un=ue.extend({run:function(e,t,n,r){this.stop(),this._el=e,this._inProgress=!0,this._duration=n||.25,this._easeOutPower=1/Math.max(r||.5,.2),this._startPos=It(e),this._offset=t.subtract(this._startPos),this._startTime=+new Date,this.fire(`start`),this._animate()},stop:function(){this._inProgress&&(this._step(!0),this._complete())},_animate:function(){this._animId=_(this._animate,this),this._step()},_step:function(e){var t=+new Date-this._startTime,n=this._duration*1e3;t<n?this._runFrame(this._easeOut(t/n),e):(this._runFrame(1),this._complete())},_runFrame:function(e,t){var n=this._startPos.add(this._offset.multiplyBy(e));t&&n._round(),B(this._el,n),this.fire(`step`)},_complete:function(){v(this._animId),this._inProgress=!1,this.fire(`end`)},_easeOut:function(e){return 1-(1-e)**this._easeOutPower}}),K=ue.extend({options:{crs:ve,center:void 0,zoom:void 0,minZoom:void 0,maxZoom:void 0,layers:[],maxBounds:void 0,renderer:void 0,zoomAnimation:!0,zoomAnimationThreshold:4,fadeAnimation:!0,markerZoomAnimation:!0,transform3DLimit:8388608,zoomSnap:1,zoomDelta:1,trackResize:!0},initialize:function(e,t){t=p(this,t),this._handlers=[],this._layers={},this._zoomBoundLayers={},this._sizeChanged=!0,this._initContainer(e),this._initLayout(),this._onResize=i(this._onResize,this),this._initEvents(),t.maxBounds&&this.setMaxBounds(t.maxBounds),t.zoom!==void 0&&(this._zoom=this._limitZoom(t.zoom)),t.center&&t.zoom!==void 0&&this.setView(O(t.center),t.zoom,{reset:!0}),this.callInitHooks(),this._zoomAnimated=Ct&&M.any3d&&!M.mobileOpera&&this.options.zoomAnimation,this._zoomAnimated&&(this._createAnimProxy(),H(this._proxy,wt,this._catchTransitionEnd,this)),this._addLayers(this.options.layers)},setView:function(e,t,r){return t=t===void 0?this._zoom:this._limitZoom(t),e=this._limitCenter(O(e),t,this.options.maxBounds),r||={},this._stop(),this._loaded&&!r.reset&&r!==!0&&(r.animate!==void 0&&(r.zoom=n({animate:r.animate},r.zoom),r.pan=n({animate:r.animate,duration:r.duration},r.pan)),this._zoom===t?this._tryAnimatedPan(e,r.pan):this._tryAnimatedZoom&&this._tryAnimatedZoom(e,t,r.zoom))?(clearTimeout(this._sizeTimer),this):(this._resetView(e,t,r.pan&&r.pan.noMoveStart),this)},setZoom:function(e,t){return this._loaded?this.setView(this.getCenter(),e,{zoom:t}):(this._zoom=e,this)},zoomIn:function(e,t){return e||=M.any3d?this.options.zoomDelta:1,this.setZoom(this._zoom+e,t)},zoomOut:function(e,t){return e||=M.any3d?this.options.zoomDelta:1,this.setZoom(this._zoom-e,t)},setZoomAround:function(e,t,n){var r=this.getZoomScale(t),i=this.getSize().divideBy(2),a=(e instanceof x?e:this.latLngToContainerPoint(e)).subtract(i).multiplyBy(1-1/r),o=this.containerPointToLatLng(i.add(a));return this.setView(o,t,{zoom:n})},_getBoundsCenterZoom:function(e,t){t||={},e=e.getBounds?e.getBounds():E(e);var n=S(t.paddingTopLeft||t.padding||[0,0]),r=S(t.paddingBottomRight||t.padding||[0,0]),i=this.getBoundsZoom(e,!1,n.add(r));if(i=typeof t.maxZoom==`number`?Math.min(t.maxZoom,i):i,i===1/0)return{center:e.getCenter(),zoom:i};var a=r.subtract(n).divideBy(2),o=this.project(e.getSouthWest(),i),s=this.project(e.getNorthEast(),i);return{center:this.unproject(o.add(s).divideBy(2).add(a),i),zoom:i}},fitBounds:function(e,t){if(e=E(e),!e.isValid())throw Error(`Bounds are not valid.`);var n=this._getBoundsCenterZoom(e,t);return this.setView(n.center,n.zoom,t)},fitWorld:function(e){return this.fitBounds([[-90,-180],[90,180]],e)},panTo:function(e,t){return this.setView(e,this._zoom,{pan:t})},panBy:function(e,t){if(e=S(e).round(),t||={},!e.x&&!e.y)return this.fire(`moveend`);if(t.animate!==!0&&!this.getSize().contains(e))return this._resetView(this.unproject(this.project(this.getCenter()).add(e)),this.getZoom()),this;if(this._panAnim||(this._panAnim=new un,this._panAnim.on({step:this._onPanTransitionStep,end:this._onPanTransitionEnd},this)),t.noMoveStart||this.fire(`movestart`),t.animate!==!1){I(this._mapPane,`leaflet-pan-anim`);var n=this._getMapPanePos().subtract(e).round();this._panAnim.run(this._mapPane,n,t.duration||.25,t.easeLinearity)}else this._rawPanBy(e),this.fire(`move`).fire(`moveend`);return this},flyTo:function(e,t,n){if(n||={},n.animate===!1||!M.any3d)return this.setView(e,t,n);this._stop();var r=this.project(this.getCenter()),i=this.project(e),a=this.getSize(),o=this._zoom;e=O(e),t=t===void 0?o:t;var s=Math.max(a.x,a.y),c=s*this.getZoomScale(o,t),l=i.distanceTo(r)||1,u=1.42,d=u*u;function f(e){var t=e?-1:1,n=e?c:s,r=(c*c-s*s+t*d*d*l*l)/(2*n*d*l),i=Math.sqrt(r*r+1)-r;return i<1e-9?-18:Math.log(i)}function p(e){return(Math.exp(e)-Math.exp(-e))/2}function m(e){return(Math.exp(e)+Math.exp(-e))/2}function ee(e){return p(e)/m(e)}var h=f(0);function g(e){return s*(m(h)/m(h+u*e))}function te(e){return s*(m(h)*ee(h+u*e)-p(h))/d}function ne(e){return 1-(1-e)**1.5}var re=Date.now(),ie=(f(1)-h)/u,ae=n.duration?1e3*n.duration:1e3*ie*.8;function oe(){var n=(Date.now()-re)/ae,a=ne(n)*ie;n<=1?(this._flyToFrame=_(oe,this),this._move(this.unproject(r.add(i.subtract(r).multiplyBy(te(a)/l)),o),this.getScaleZoom(s/g(a),o),{flyTo:!0})):this._move(e,t)._moveEnd(!0)}return this._moveStart(!0,n.noMoveStart),oe.call(this),this},flyToBounds:function(e,t){var n=this._getBoundsCenterZoom(e,t);return this.flyTo(n.center,n.zoom,t)},setMaxBounds:function(e){return e=E(e),this.listens(`moveend`,this._panInsideMaxBounds)&&this.off(`moveend`,this._panInsideMaxBounds),e.isValid()?(this.options.maxBounds=e,this._loaded&&this._panInsideMaxBounds(),this.on(`moveend`,this._panInsideMaxBounds)):(this.options.maxBounds=null,this)},setMinZoom:function(e){var t=this.options.minZoom;return this.options.minZoom=e,this._loaded&&t!==e&&(this.fire(`zoomlevelschange`),this.getZoom()<this.options.minZoom)?this.setZoom(e):this},setMaxZoom:function(e){var t=this.options.maxZoom;return this.options.maxZoom=e,this._loaded&&t!==e&&(this.fire(`zoomlevelschange`),this.getZoom()>this.options.maxZoom)?this.setZoom(e):this},panInsideBounds:function(e,t){this._enforcingBounds=!0;var n=this.getCenter(),r=this._limitCenter(n,this._zoom,E(e));return n.equals(r)||this.panTo(r,t),this._enforcingBounds=!1,this},panInside:function(e,t){t||={};var n=S(t.paddingTopLeft||t.padding||[0,0]),r=S(t.paddingBottomRight||t.padding||[0,0]),i=this.project(this.getCenter()),a=this.project(e),o=this.getPixelBounds(),s=w([o.min.add(n),o.max.subtract(r)]),c=s.getSize();if(!s.contains(a)){this._enforcingBounds=!0;var l=a.subtract(s.getCenter()),u=s.extend(a).getSize().subtract(c);i.x+=l.x<0?-u.x:u.x,i.y+=l.y<0?-u.y:u.y,this.panTo(this.unproject(i),t),this._enforcingBounds=!1}return this},invalidateSize:function(e){if(!this._loaded)return this;e=n({animate:!1,pan:!0},e===!0?{animate:!0}:e);var t=this.getSize();this._sizeChanged=!0,this._lastCenter=null;var r=this.getSize(),a=t.divideBy(2).round(),o=r.divideBy(2).round(),s=a.subtract(o);return!s.x&&!s.y?this:(e.animate&&e.pan?this.panBy(s):(e.pan&&this._rawPanBy(s),this.fire(`move`),e.debounceMoveend?(clearTimeout(this._sizeTimer),this._sizeTimer=setTimeout(i(this.fire,this,`moveend`),200)):this.fire(`moveend`)),this.fire(`resize`,{oldSize:t,newSize:r}))},stop:function(){return this.setZoom(this._limitZoom(this._zoom)),this.options.zoomSnap||this.fire(`viewreset`),this._stop()},locate:function(e){if(e=this._locateOptions=n({timeout:1e4,watch:!1},e),!(`geolocation`in navigator))return this._handleGeolocationError({code:0,message:`Geolocation not supported.`}),this;var t=i(this._handleGeolocationResponse,this),r=i(this._handleGeolocationError,this);return e.watch?this._locationWatchId=navigator.geolocation.watchPosition(t,r,e):navigator.geolocation.getCurrentPosition(t,r,e),this},stopLocate:function(){return navigator.geolocation&&navigator.geolocation.clearWatch&&navigator.geolocation.clearWatch(this._locationWatchId),this._locateOptions&&(this._locateOptions.setView=!1),this},_handleGeolocationError:function(e){if(this._container._leaflet_id){var t=e.code,n=e.message||(t===1?`permission denied`:t===2?`position unavailable`:`timeout`);this._locateOptions.setView&&!this._loaded&&this.fitWorld(),this.fire(`locationerror`,{code:t,message:`Geolocation error: `+n+`.`})}},_handleGeolocationResponse:function(e){if(this._container._leaflet_id){var t=e.coords.latitude,n=e.coords.longitude,r=new D(t,n),i=r.toBounds(e.coords.accuracy*2),a=this._locateOptions;if(a.setView){var o=this.getBoundsZoom(i);this.setView(r,a.maxZoom?Math.min(o,a.maxZoom):o)}var s={latlng:r,bounds:i,timestamp:e.timestamp};for(var c in e.coords)typeof e.coords[c]==`number`&&(s[c]=e.coords[c]);this.fire(`locationfound`,s)}},addHandler:function(e,t){if(!t)return this;var n=this[e]=new t(this);return this._handlers.push(n),this.options[e]&&n.enable(),this},remove:function(){if(this._initEvents(!0),this.options.maxBounds&&this.off(`moveend`,this._panInsideMaxBounds),this._containerId!==this._container._leaflet_id)throw Error(`Map container is being reused by another instance`);try{delete this._container._leaflet_id,delete this._containerId}catch{this._container._leaflet_id=void 0,this._containerId=void 0}for(var e in this._locationWatchId!==void 0&&this.stopLocate(),this._stop(),F(this._mapPane),this._clearControlPos&&this._clearControlPos(),this._resizeRequest&&=(v(this._resizeRequest),null),this._clearHandlers(),this._loaded&&this.fire(`unload`),this._layers)this._layers[e].remove();for(e in this._panes)F(this._panes[e]);return this._layers=[],this._panes=[],delete this._mapPane,delete this._renderer,this},createPane:function(e,t){var n=P(`div`,`leaflet-pane`+(e?` leaflet-`+e.replace(`Pane`,``)+`-pane`:``),t||this._mapPane);return e&&(this._panes[e]=n),n},getCenter:function(){return this._checkIfLoaded(),this._lastCenter&&!this._moved()?this._lastCenter.clone():this.layerPointToLatLng(this._getCenterLayerPoint())},getZoom:function(){return this._zoom},getBounds:function(){var e=this.getPixelBounds();return new T(this.unproject(e.getBottomLeft()),this.unproject(e.getTopRight()))},getMinZoom:function(){return this.options.minZoom===void 0?this._layersMinZoom||0:this.options.minZoom},getMaxZoom:function(){return this.options.maxZoom===void 0?this._layersMaxZoom===void 0?1/0:this._layersMaxZoom:this.options.maxZoom},getBoundsZoom:function(e,t,n){e=E(e),n=S(n||[0,0]);var r=this.getZoom()||0,i=this.getMinZoom(),a=this.getMaxZoom(),o=e.getNorthWest(),s=e.getSouthEast(),c=this.getSize().subtract(n),l=w(this.project(s,r),this.project(o,r)).getSize(),u=M.any3d?this.options.zoomSnap:1,d=c.x/l.x,f=c.y/l.y,p=t?Math.max(d,f):Math.min(d,f);return r=this.getScaleZoom(p,r),u&&(r=Math.round(r/(u/100))*(u/100),r=t?Math.ceil(r/u)*u:Math.floor(r/u)*u),Math.max(i,Math.min(a,r))},getSize:function(){return(!this._size||this._sizeChanged)&&(this._size=new x(this._container.clientWidth||0,this._container.clientHeight||0),this._sizeChanged=!1),this._size.clone()},getPixelBounds:function(e,t){var n=this._getTopLeftPoint(e,t);return new C(n,n.add(this.getSize()))},getPixelOrigin:function(){return this._checkIfLoaded(),this._pixelOrigin},getPixelWorldBounds:function(e){return this.options.crs.getProjectedBounds(e===void 0?this.getZoom():e)},getPane:function(e){return typeof e==`string`?this._panes[e]:e},getPanes:function(){return this._panes},getContainer:function(){return this._container},getZoomScale:function(e,t){var n=this.options.crs;return t=t===void 0?this._zoom:t,n.scale(e)/n.scale(t)},getScaleZoom:function(e,t){var n=this.options.crs;t=t===void 0?this._zoom:t;var r=n.zoom(e*n.scale(t));return isNaN(r)?1/0:r},project:function(e,t){return t=t===void 0?this._zoom:t,this.options.crs.latLngToPoint(O(e),t)},unproject:function(e,t){return t=t===void 0?this._zoom:t,this.options.crs.pointToLatLng(S(e),t)},layerPointToLatLng:function(e){var t=S(e).add(this.getPixelOrigin());return this.unproject(t)},latLngToLayerPoint:function(e){return this.project(O(e))._round()._subtract(this.getPixelOrigin())},wrapLatLng:function(e){return this.options.crs.wrapLatLng(O(e))},wrapLatLngBounds:function(e){return this.options.crs.wrapLatLngBounds(E(e))},distance:function(e,t){return this.options.crs.distance(O(e),O(t))},containerPointToLayerPoint:function(e){return S(e).subtract(this._getMapPanePos())},layerPointToContainerPoint:function(e){return S(e).add(this._getMapPanePos())},containerPointToLatLng:function(e){var t=this.containerPointToLayerPoint(S(e));return this.layerPointToLatLng(t)},latLngToContainerPoint:function(e){return this.layerPointToContainerPoint(this.latLngToLayerPoint(O(e)))},mouseEventToContainerPoint:function(e){return an(e,this._container)},mouseEventToLayerPoint:function(e){return this.containerPointToLayerPoint(this.mouseEventToContainerPoint(e))},mouseEventToLatLng:function(e){return this.layerPointToLatLng(this.mouseEventToLayerPoint(e))},_initContainer:function(e){var t=this._container=Tt(e);if(!t)throw Error(`Map container not found.`);if(t._leaflet_id)throw Error(`Map container is already initialized.`);H(t,`scroll`,this._onScroll,this),this._containerId=o(t)},_initLayout:function(){var e=this._container;this._fadeAnimated=this.options.fadeAnimation&&M.any3d,I(e,`leaflet-container`+(M.touch?` leaflet-touch`:``)+(M.retina?` leaflet-retina`:``)+(M.ielt9?` leaflet-oldie`:``)+(M.safari?` leaflet-safari`:``)+(this._fadeAnimated?` leaflet-fade-anim`:``));var t=Et(e,`position`);t!==`absolute`&&t!==`relative`&&t!==`fixed`&&t!==`sticky`&&(e.style.position=`relative`),this._initPanes(),this._initControlPos&&this._initControlPos()},_initPanes:function(){var e=this._panes={};this._paneRenderers={},this._mapPane=this.createPane(`mapPane`,this._container),B(this._mapPane,new x(0,0)),this.createPane(`tilePane`),this.createPane(`overlayPane`),this.createPane(`shadowPane`),this.createPane(`markerPane`),this.createPane(`tooltipPane`),this.createPane(`popupPane`),this.options.markerZoomAnimation||(I(e.markerPane,`leaflet-zoom-hide`),I(e.shadowPane,`leaflet-zoom-hide`))},_resetView:function(e,t,n){B(this._mapPane,new x(0,0));var r=!this._loaded;this._loaded=!0,t=this._limitZoom(t),this.fire(`viewprereset`);var i=this._zoom!==t;this._moveStart(i,n)._move(e,t)._moveEnd(i),this.fire(`viewreset`),r&&this.fire(`load`)},_moveStart:function(e,t){return e&&this.fire(`zoomstart`),t||this.fire(`movestart`),this},_move:function(e,t,n,r){t===void 0&&(t=this._zoom);var i=this._zoom!==t;return this._zoom=t,this._lastCenter=e,this._pixelOrigin=this._getNewPixelOrigin(e),r?n&&n.pinch&&this.fire(`zoom`,n):((i||n&&n.pinch)&&this.fire(`zoom`,n),this.fire(`move`,n)),this},_moveEnd:function(e){return e&&this.fire(`zoomend`),this.fire(`moveend`)},_stop:function(){return v(this._flyToFrame),this._panAnim&&this._panAnim.stop(),this},_rawPanBy:function(e){B(this._mapPane,this._getMapPanePos().subtract(e))},_getZoomSpan:function(){return this.getMaxZoom()-this.getMinZoom()},_panInsideMaxBounds:function(){this._enforcingBounds||this.panInsideBounds(this.options.maxBounds)},_checkIfLoaded:function(){if(!this._loaded)throw Error(`Set map center and zoom first.`)},_initEvents:function(e){this._targets={},this._targets[o(this._container)]=this;var t=e?W:H;t(this._container,`click dblclick mousedown mouseup mouseover mouseout mousemove contextmenu keypress keydown keyup`,this._handleDOMEvent,this),this.options.trackResize&&t(window,`resize`,this._onResize,this),M.any3d&&this.options.transform3DLimit&&(e?this.off:this.on).call(this,`moveend`,this._onMoveEnd)},_onResize:function(){v(this._resizeRequest),this._resizeRequest=_(function(){this.invalidateSize({debounceMoveend:!0})},this)},_onScroll:function(){this._container.scrollTop=0,this._container.scrollLeft=0},_onMoveEnd:function(){var e=this._getMapPanePos();Math.max(Math.abs(e.x),Math.abs(e.y))>=this.options.transform3DLimit&&this._resetView(this.getCenter(),this.getZoom())},_findEventTargets:function(e,t){for(var n=[],r,i=t===`mouseout`||t===`mouseover`,a=e.target||e.srcElement,s=!1;a;){if(r=this._targets[o(a)],r&&(t===`click`||t===`preclick`)&&this._draggableMoved(r)){s=!0;break}if(r&&r.listens(t,!0)&&(i&&!cn(a,e)||(n.push(r),i))||a===this._container)break;a=a.parentNode}return!n.length&&!s&&!i&&this.listens(t,!0)&&(n=[this]),n},_isClickDisabled:function(e){for(;e&&e!==this._container;){if(e._leaflet_disable_click)return!0;e=e.parentNode}},_handleDOMEvent:function(e){var t=e.target||e.srcElement;if(!(!this._loaded||t._leaflet_disable_events||e.type===`click`&&this._isClickDisabled(t))){var n=e.type;n===`mousedown`&&Wt(t),this._fireDOMEvent(e,n)}},_mouseEvents:[`click`,`dblclick`,`mouseover`,`mouseout`,`contextmenu`],_fireDOMEvent:function(e,t,r){if(e.type===`click`){var i=n({},e);i.type=`preclick`,this._fireDOMEvent(i,i.type,r)}var a=this._findEventTargets(e,t);if(r){for(var o=[],s=0;s<r.length;s++)r[s].listens(t,!0)&&o.push(r[s]);a=o.concat(a)}if(a.length){t===`contextmenu`&&G(e);var c=a[0],l={originalEvent:e};if(e.type!==`keypress`&&e.type!==`keydown`&&e.type!==`keyup`){var u=c.getLatLng&&(!c._radius||c._radius<=10);l.containerPoint=u?this.latLngToContainerPoint(c.getLatLng()):this.mouseEventToContainerPoint(e),l.layerPoint=this.containerPointToLayerPoint(l.containerPoint),l.latlng=u?c.getLatLng():this.layerPointToLatLng(l.layerPoint)}for(s=0;s<a.length;s++)if(a[s].fire(t,l,!0),l.originalEvent._stopped||a[s].options.bubblingMouseEvents===!1&&te(this._mouseEvents,t)!==-1)return}},_draggableMoved:function(e){return e=e.dragging&&e.dragging.enabled()?e:this,e.dragging&&e.dragging.moved()||this.boxZoom&&this.boxZoom.moved()},_clearHandlers:function(){for(var e=0,t=this._handlers.length;e<t;e++)this._handlers[e].disable()},whenReady:function(e,t){return this._loaded?e.call(t||this,{target:this}):this.on(`load`,e,t),this},_getMapPanePos:function(){return It(this._mapPane)||new x(0,0)},_moved:function(){var e=this._getMapPanePos();return e&&!e.equals([0,0])},_getTopLeftPoint:function(e,t){return(e&&t!==void 0?this._getNewPixelOrigin(e,t):this.getPixelOrigin()).subtract(this._getMapPanePos())},_getNewPixelOrigin:function(e,t){var n=this.getSize()._divideBy(2);return this.project(e,t)._subtract(n)._add(this._getMapPanePos())._round()},_latLngToNewLayerPoint:function(e,t,n){var r=this._getNewPixelOrigin(n,t);return this.project(e,t)._subtract(r)},_latLngBoundsToNewLayerBounds:function(e,t,n){var r=this._getNewPixelOrigin(n,t);return w([this.project(e.getSouthWest(),t)._subtract(r),this.project(e.getNorthWest(),t)._subtract(r),this.project(e.getSouthEast(),t)._subtract(r),this.project(e.getNorthEast(),t)._subtract(r)])},_getCenterLayerPoint:function(){return this.containerPointToLayerPoint(this.getSize()._divideBy(2))},_getCenterOffset:function(e){return this.latLngToLayerPoint(e).subtract(this._getCenterLayerPoint())},_limitCenter:function(e,t,n){if(!n)return e;var r=this.project(e,t),i=this.getSize().divideBy(2),a=new C(r.subtract(i),r.add(i)),o=this._getBoundsOffset(a,n,t);return Math.abs(o.x)<=1&&Math.abs(o.y)<=1?e:this.unproject(r.add(o),t)},_limitOffset:function(e,t){if(!t)return e;var n=this.getPixelBounds(),r=new C(n.min.add(e),n.max.add(e));return e.add(this._getBoundsOffset(r,t))},_getBoundsOffset:function(e,t,n){var r=w(this.project(t.getNorthEast(),n),this.project(t.getSouthWest(),n)),i=r.min.subtract(e.min),a=r.max.subtract(e.max);return new x(this._rebound(i.x,-a.x),this._rebound(i.y,-a.y))},_rebound:function(e,t){return e+t>0?Math.round(e-t)/2:Math.max(0,Math.ceil(e))-Math.max(0,Math.floor(t))},_limitZoom:function(e){var t=this.getMinZoom(),n=this.getMaxZoom(),r=M.any3d?this.options.zoomSnap:1;return r&&(e=Math.round(e/r)*r),Math.max(t,Math.min(n,e))},_onPanTransitionStep:function(){this.fire(`move`)},_onPanTransitionEnd:function(){R(this._mapPane,`leaflet-pan-anim`),this.fire(`moveend`)},_tryAnimatedPan:function(e,t){var n=this._getCenterOffset(e)._trunc();return(t&&t.animate)!==!0&&!this.getSize().contains(n)?!1:(this.panBy(n,t),!0)},_createAnimProxy:function(){var e=this._proxy=P(`div`,`leaflet-proxy leaflet-zoom-animated`);this._panes.mapPane.appendChild(e),this.on(`zoomanim`,function(e){var t=St,n=this._proxy.style[t];Ft(this._proxy,this.project(e.center,e.zoom),this.getZoomScale(e.zoom,1)),n===this._proxy.style[t]&&this._animatingZoom&&this._onZoomTransitionEnd()},this),this.on(`load moveend`,this._animMoveEnd,this),this._on(`unload`,this._destroyAnimProxy,this)},_destroyAnimProxy:function(){F(this._proxy),this.off(`load moveend`,this._animMoveEnd,this),delete this._proxy},_animMoveEnd:function(){var e=this.getCenter(),t=this.getZoom();Ft(this._proxy,this.project(e,t),this.getZoomScale(t,1))},_catchTransitionEnd:function(e){this._animatingZoom&&e.propertyName.indexOf(`transform`)>=0&&this._onZoomTransitionEnd()},_nothingToAnimate:function(){return!this._container.getElementsByClassName(`leaflet-zoom-animated`).length},_tryAnimatedZoom:function(e,t,n){if(this._animatingZoom)return!0;if(n||={},!this._zoomAnimated||n.animate===!1||this._nothingToAnimate()||Math.abs(t-this._zoom)>this.options.zoomAnimationThreshold)return!1;var r=this.getZoomScale(t),i=this._getCenterOffset(e)._divideBy(1-1/r);return n.animate!==!0&&!this.getSize().contains(i)?!1:(_(function(){this._moveStart(!0,n.noMoveStart||!1)._animateZoom(e,t,!0)},this),!0)},_animateZoom:function(e,t,n,r){this._mapPane&&(n&&(this._animatingZoom=!0,this._animateToCenter=e,this._animateToZoom=t,I(this._mapPane,`leaflet-zoom-anim`)),this.fire(`zoomanim`,{center:e,zoom:t,noUpdate:r}),this._tempFireZoomEvent||=this._zoom!==this._animateToZoom,this._move(this._animateToCenter,this._animateToZoom,void 0,!0),setTimeout(i(this._onZoomTransitionEnd,this),250))},_onZoomTransitionEnd:function(){this._animatingZoom&&(this._mapPane&&R(this._mapPane,`leaflet-zoom-anim`),this._animatingZoom=!1,this._move(this._animateToCenter,this._animateToZoom,void 0,!0),this._tempFireZoomEvent&&this.fire(`zoom`),delete this._tempFireZoomEvent,this.fire(`move`),this._moveEnd(!0))}});function dn(e,t){return new K(e,t)}var q=y.extend({options:{position:`topright`},initialize:function(e){p(this,e)},getPosition:function(){return this.options.position},setPosition:function(e){var t=this._map;return t&&t.removeControl(this),this.options.position=e,t&&t.addControl(this),this},getContainer:function(){return this._container},addTo:function(e){this.remove(),this._map=e;var t=this._container=this.onAdd(e),n=this.getPosition(),r=e._controlCorners[n];return I(t,`leaflet-control`),n.indexOf(`bottom`)===-1?r.appendChild(t):r.insertBefore(t,r.firstChild),this._map.on(`unload`,this.remove,this),this},remove:function(){return this._map?(F(this._container),this.onRemove&&this.onRemove(this._map),this._map.off(`unload`,this.remove,this),this._map=null,this):this},_refocusOnMap:function(e){this._map&&e&&e.screenX>0&&e.screenY>0&&this._map.getContainer().focus()}}),fn=function(e){return new q(e)};K.include({addControl:function(e){return e.addTo(this),this},removeControl:function(e){return e.remove(),this},_initControlPos:function(){var e=this._controlCorners={},t=`leaflet-`,n=this._controlContainer=P(`div`,t+`control-container`,this._container);function r(r,i){var a=t+r+` `+t+i;e[r+i]=P(`div`,a,n)}r(`top`,`left`),r(`top`,`right`),r(`bottom`,`left`),r(`bottom`,`right`)},_clearControlPos:function(){for(var e in this._controlCorners)F(this._controlCorners[e]);F(this._controlContainer),delete this._controlCorners,delete this._controlContainer}});var pn=q.extend({options:{collapsed:!0,position:`topright`,autoZIndex:!0,hideSingleBase:!1,sortLayers:!1,sortFunction:function(e,t,n,r){return n<r?-1:+(r<n)}},initialize:function(e,t,n){for(var r in p(this,n),this._layerControlInputs=[],this._layers=[],this._lastZIndex=0,this._handlingClick=!1,this._preventClick=!1,e)this._addLayer(e[r],r);for(r in t)this._addLayer(t[r],r,!0)},onAdd:function(e){this._initLayout(),this._update(),this._map=e,e.on(`zoomend`,this._checkDisabledLayers,this);for(var t=0;t<this._layers.length;t++)this._layers[t].layer.on(`add remove`,this._onLayerChange,this);return this._container},addTo:function(e){return q.prototype.addTo.call(this,e),this._expandIfNotCollapsed()},onRemove:function(){this._map.off(`zoomend`,this._checkDisabledLayers,this);for(var e=0;e<this._layers.length;e++)this._layers[e].layer.off(`add remove`,this._onLayerChange,this)},addBaseLayer:function(e,t){return this._addLayer(e,t),this._map?this._update():this},addOverlay:function(e,t){return this._addLayer(e,t,!0),this._map?this._update():this},removeLayer:function(e){e.off(`add remove`,this._onLayerChange,this);var t=this._getLayer(o(e));return t&&this._layers.splice(this._layers.indexOf(t),1),this._map?this._update():this},expand:function(){I(this._container,`leaflet-control-layers-expanded`),this._section.style.height=null;var e=this._map.getSize().y-(this._container.offsetTop+50);return e<this._section.clientHeight?(I(this._section,`leaflet-control-layers-scrollbar`),this._section.style.height=e+`px`):R(this._section,`leaflet-control-layers-scrollbar`),this._checkDisabledLayers(),this},collapse:function(){return R(this._container,`leaflet-control-layers-expanded`),this},_initLayout:function(){var e=`leaflet-control-layers`,t=this._container=P(`div`,e),n=this.options.collapsed;t.setAttribute(`aria-haspopup`,!0),tn(t),en(t);var r=this._section=P(`section`,e+`-list`);n&&(this._map.on(`click`,this.collapse,this),H(t,{mouseenter:this._expandSafely,mouseleave:this.collapse},this));var i=this._layersLink=P(`a`,e+`-toggle`,t);i.href=`#`,i.title=`Layers`,i.setAttribute(`role`,`button`),H(i,{keydown:function(e){e.keyCode===13&&this._expandSafely()},click:function(e){G(e),this._expandSafely()}},this),n||this.expand(),this._baseLayersList=P(`div`,e+`-base`,r),this._separator=P(`div`,e+`-separator`,r),this._overlaysList=P(`div`,e+`-overlays`,r),t.appendChild(r)},_getLayer:function(e){for(var t=0;t<this._layers.length;t++)if(this._layers[t]&&o(this._layers[t].layer)===e)return this._layers[t]},_addLayer:function(e,t,n){this._map&&e.on(`add remove`,this._onLayerChange,this),this._layers.push({layer:e,name:t,overlay:n}),this.options.sortLayers&&this._layers.sort(i(function(e,t){return this.options.sortFunction(e.layer,t.layer,e.name,t.name)},this)),this.options.autoZIndex&&e.setZIndex&&(this._lastZIndex++,e.setZIndex(this._lastZIndex)),this._expandIfNotCollapsed()},_update:function(){if(!this._container)return this;Dt(this._baseLayersList),Dt(this._overlaysList),this._layerControlInputs=[];var e,t,n,r,i=0;for(n=0;n<this._layers.length;n++)r=this._layers[n],this._addItem(r),t||=r.overlay,e||=!r.overlay,i+=+!r.overlay;return this.options.hideSingleBase&&(e&&=i>1,this._baseLayersList.style.display=e?``:`none`),this._separator.style.display=t&&e?``:`none`,this},_onLayerChange:function(e){this._handlingClick||this._update();var t=this._getLayer(o(e.target)),n=t.overlay?e.type===`add`?`overlayadd`:`overlayremove`:e.type===`add`?`baselayerchange`:null;n&&this._map.fire(n,t)},_createRadioElement:function(e,t){var n=`<input type="radio" class="leaflet-control-layers-selector" name="`+e+`"`+(t?` checked="checked"`:``)+`/>`,r=document.createElement(`div`);return r.innerHTML=n,r.firstChild},_addItem:function(e){var t=document.createElement(`label`),n=this._map.hasLayer(e.layer),r;e.overlay?(r=document.createElement(`input`),r.type=`checkbox`,r.className=`leaflet-control-layers-selector`,r.defaultChecked=n):r=this._createRadioElement(`leaflet-base-layers_`+o(this),n),this._layerControlInputs.push(r),r.layerId=o(e.layer),H(r,`click`,this._onInputClick,this);var i=document.createElement(`span`);i.innerHTML=` `+e.name;var a=document.createElement(`span`);return t.appendChild(a),a.appendChild(r),a.appendChild(i),(e.overlay?this._overlaysList:this._baseLayersList).appendChild(t),this._checkDisabledLayers(),t},_onInputClick:function(){if(!this._preventClick){var e=this._layerControlInputs,t,n,r=[],i=[];this._handlingClick=!0;for(var a=e.length-1;a>=0;a--)t=e[a],n=this._getLayer(t.layerId).layer,t.checked?r.push(n):t.checked||i.push(n);for(a=0;a<i.length;a++)this._map.hasLayer(i[a])&&this._map.removeLayer(i[a]);for(a=0;a<r.length;a++)this._map.hasLayer(r[a])||this._map.addLayer(r[a]);this._handlingClick=!1,this._refocusOnMap()}},_checkDisabledLayers:function(){for(var e=this._layerControlInputs,t,n,r=this._map.getZoom(),i=e.length-1;i>=0;i--)t=e[i],n=this._getLayer(t.layerId).layer,t.disabled=n.options.minZoom!==void 0&&r<n.options.minZoom||n.options.maxZoom!==void 0&&r>n.options.maxZoom},_expandIfNotCollapsed:function(){return this._map&&!this.options.collapsed&&this.expand(),this},_expandSafely:function(){var e=this._section;this._preventClick=!0,H(e,`click`,G),this.expand();var t=this;setTimeout(function(){W(e,`click`,G),t._preventClick=!1})}}),mn=function(e,t,n){return new pn(e,t,n)},hn=q.extend({options:{position:`topleft`,zoomInText:`<span aria-hidden="true">+</span>`,zoomInTitle:`Zoom in`,zoomOutText:`<span aria-hidden="true">&#x2212;</span>`,zoomOutTitle:`Zoom out`},onAdd:function(e){var t=`leaflet-control-zoom`,n=P(`div`,t+` leaflet-bar`),r=this.options;return this._zoomInButton=this._createButton(r.zoomInText,r.zoomInTitle,t+`-in`,n,this._zoomIn),this._zoomOutButton=this._createButton(r.zoomOutText,r.zoomOutTitle,t+`-out`,n,this._zoomOut),this._updateDisabled(),e.on(`zoomend zoomlevelschange`,this._updateDisabled,this),n},onRemove:function(e){e.off(`zoomend zoomlevelschange`,this._updateDisabled,this)},disable:function(){return this._disabled=!0,this._updateDisabled(),this},enable:function(){return this._disabled=!1,this._updateDisabled(),this},_zoomIn:function(e){!this._disabled&&this._map._zoom<this._map.getMaxZoom()&&this._map.zoomIn(this._map.options.zoomDelta*(e.shiftKey?3:1))},_zoomOut:function(e){!this._disabled&&this._map._zoom>this._map.getMinZoom()&&this._map.zoomOut(this._map.options.zoomDelta*(e.shiftKey?3:1))},_createButton:function(e,t,n,r,i){var a=P(`a`,n,r);return a.innerHTML=e,a.href=`#`,a.title=t,a.setAttribute(`role`,`button`),a.setAttribute(`aria-label`,t),tn(a),H(a,`click`,nn),H(a,`click`,i,this),H(a,`click`,this._refocusOnMap,this),a},_updateDisabled:function(){var e=this._map,t=`leaflet-disabled`;R(this._zoomInButton,t),R(this._zoomOutButton,t),this._zoomInButton.setAttribute(`aria-disabled`,`false`),this._zoomOutButton.setAttribute(`aria-disabled`,`false`),(this._disabled||e._zoom===e.getMinZoom())&&(I(this._zoomOutButton,t),this._zoomOutButton.setAttribute(`aria-disabled`,`true`)),(this._disabled||e._zoom===e.getMaxZoom())&&(I(this._zoomInButton,t),this._zoomInButton.setAttribute(`aria-disabled`,`true`))}});K.mergeOptions({zoomControl:!0}),K.addInitHook(function(){this.options.zoomControl&&(this.zoomControl=new hn,this.addControl(this.zoomControl))});var gn=function(e){return new hn(e)},_n=q.extend({options:{position:`bottomleft`,maxWidth:100,metric:!0,imperial:!0},onAdd:function(e){var t=`leaflet-control-scale`,n=P(`div`,t),r=this.options;return this._addScales(r,t+`-line`,n),e.on(r.updateWhenIdle?`moveend`:`move`,this._update,this),e.whenReady(this._update,this),n},onRemove:function(e){e.off(this.options.updateWhenIdle?`moveend`:`move`,this._update,this)},_addScales:function(e,t,n){e.metric&&(this._mScale=P(`div`,t,n)),e.imperial&&(this._iScale=P(`div`,t,n))},_update:function(){var e=this._map,t=e.getSize().y/2,n=e.distance(e.containerPointToLatLng([0,t]),e.containerPointToLatLng([this.options.maxWidth,t]));this._updateScales(n)},_updateScales:function(e){this.options.metric&&e&&this._updateMetric(e),this.options.imperial&&e&&this._updateImperial(e)},_updateMetric:function(e){var t=this._getRoundNum(e),n=t<1e3?t+` m`:t/1e3+` km`;this._updateScale(this._mScale,n,t/e)},_updateImperial:function(e){var t=e*3.2808399,n,r,i;t>5280?(n=t/5280,r=this._getRoundNum(n),this._updateScale(this._iScale,r+` mi`,r/n)):(i=this._getRoundNum(t),this._updateScale(this._iScale,i+` ft`,i/t))},_updateScale:function(e,t,n){e.style.width=Math.round(this.options.maxWidth*n)+`px`,e.innerHTML=t},_getRoundNum:function(e){var t=10**((Math.floor(e)+``).length-1),n=e/t;return n=n>=10?10:n>=5?5:n>=3?3:n>=2?2:1,t*n}}),vn=function(e){return new _n(e)},yn=q.extend({options:{position:`bottomright`,prefix:`<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">`+(M.inlineSvg?`<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="12" height="8" viewBox="0 0 12 8" class="leaflet-attribution-flag"><path fill="#4C7BE1" d="M0 0h12v4H0z"/><path fill="#FFD500" d="M0 4h12v3H0z"/><path fill="#E0BC00" d="M0 7h12v1H0z"/></svg> `:``)+`Leaflet</a>`},initialize:function(e){p(this,e),this._attributions={}},onAdd:function(e){for(var t in e.attributionControl=this,this._container=P(`div`,`leaflet-control-attribution`),tn(this._container),e._layers)e._layers[t].getAttribution&&this.addAttribution(e._layers[t].getAttribution());return this._update(),e.on(`layeradd`,this._addAttribution,this),this._container},onRemove:function(e){e.off(`layeradd`,this._addAttribution,this)},_addAttribution:function(e){e.layer.getAttribution&&(this.addAttribution(e.layer.getAttribution()),e.layer.once(`remove`,function(){this.removeAttribution(e.layer.getAttribution())},this))},setPrefix:function(e){return this.options.prefix=e,this._update(),this},addAttribution:function(e){return e?(this._attributions[e]||(this._attributions[e]=0),this._attributions[e]++,this._update(),this):this},removeAttribution:function(e){return e&&this._attributions[e]&&(this._attributions[e]--,this._update()),this},_update:function(){if(this._map){var e=[];for(var t in this._attributions)this._attributions[t]&&e.push(t);var n=[];this.options.prefix&&n.push(this.options.prefix),e.length&&n.push(e.join(`, `)),this._container.innerHTML=n.join(` <span aria-hidden="true">|</span> `)}}});K.mergeOptions({attributionControl:!0}),K.addInitHook(function(){this.options.attributionControl&&new yn().addTo(this)}),q.Layers=pn,q.Zoom=hn,q.Scale=_n,q.Attribution=yn,fn.layers=mn,fn.zoom=gn,fn.scale=vn,fn.attribution=function(e){return new yn(e)};var bn=y.extend({initialize:function(e){this._map=e},enable:function(){return this._enabled?this:(this._enabled=!0,this.addHooks(),this)},disable:function(){return this._enabled?(this._enabled=!1,this.removeHooks(),this):this},enabled:function(){return!!this._enabled}});bn.addTo=function(e,t){return e.addHandler(t,this),this};var xn={Events:b},J=M.touch?`touchstart mousedown`:`mousedown`,Sn=ue.extend({options:{clickTolerance:3},initialize:function(e,t,n,r){p(this,r),this._element=e,this._dragStartTarget=t||e,this._preventOutline=n},enable:function(){this._enabled||=(H(this._dragStartTarget,J,this._onDown,this),!0)},disable:function(){this._enabled&&(Sn._dragging===this&&this.finishDrag(!0),W(this._dragStartTarget,J,this._onDown,this),this._enabled=!1,this._moved=!1)},_onDown:function(e){if(this._enabled&&(this._moved=!1,!At(this._element,`leaflet-zoom-anim`))){if(e.touches&&e.touches.length!==1){Sn._dragging===this&&this.finishDrag();return}if(!(Sn._dragging||e.shiftKey||e.which!==1&&e.button!==1&&!e.touches)&&(Sn._dragging=this,this._preventOutline&&Wt(this._element),Vt(),Lt(),!this._moving)){this.fire(`down`);var t=e.touches?e.touches[0]:e,n=Kt(this._element);this._startPoint=new x(t.clientX,t.clientY),this._startPos=It(this._element),this._parentScale=qt(n);var r=e.type===`mousedown`;H(document,r?`mousemove`:`touchmove`,this._onMove,this),H(document,r?`mouseup`:`touchend touchcancel`,this._onUp,this)}}},_onMove:function(e){if(this._enabled){if(e.touches&&e.touches.length>1){this._moved=!0;return}var t=e.touches&&e.touches.length===1?e.touches[0]:e,n=new x(t.clientX,t.clientY)._subtract(this._startPoint);!n.x&&!n.y||Math.abs(n.x)+Math.abs(n.y)<this.options.clickTolerance||(n.x/=this._parentScale.x,n.y/=this._parentScale.y,G(e),this._moved||(this.fire(`dragstart`),this._moved=!0,I(document.body,`leaflet-dragging`),this._lastTarget=e.target||e.srcElement,window.SVGElementInstance&&this._lastTarget instanceof window.SVGElementInstance&&(this._lastTarget=this._lastTarget.correspondingUseElement),I(this._lastTarget,`leaflet-drag-target`)),this._newPos=this._startPos.add(n),this._moving=!0,this._lastEvent=e,this._updatePosition())}},_updatePosition:function(){var e={originalEvent:this._lastEvent};this.fire(`predrag`,e),B(this._element,this._newPos),this.fire(`drag`,e)},_onUp:function(){this._enabled&&this.finishDrag()},finishDrag:function(e){R(document.body,`leaflet-dragging`),this._lastTarget&&=(R(this._lastTarget,`leaflet-drag-target`),null),W(document,`mousemove touchmove`,this._onMove,this),W(document,`mouseup touchend touchcancel`,this._onUp,this),Ht(),Rt();var t=this._moved&&this._moving;this._moving=!1,Sn._dragging=!1,t&&this.fire(`dragend`,{noInertia:e,distance:this._newPos.distanceTo(this._startPos)})}});function Cn(e,t,n){var r,i=[1,4,2,8],a,o,s,c,l,u,d,f;for(a=0,u=e.length;a<u;a++)e[a]._code=In(e[a],t);for(s=0;s<4;s++){for(d=i[s],r=[],a=0,u=e.length,o=u-1;a<u;o=a++)c=e[a],l=e[o],c._code&d?l._code&d||(f=Fn(l,c,d,t,n),f._code=In(f,t),r.push(f)):(l._code&d&&(f=Fn(l,c,d,t,n),f._code=In(f,t),r.push(f)),r.push(c));e=r}return e}function wn(e,t){var n,r,i,a,o,s,c,l,u;if(!e||e.length===0)throw Error(`latlngs not passed`);Y(e)||(console.warn(`latlngs are not flat! Only the first ring will be used`),e=e[0]);var d=O([0,0]),f=E(e);f.getNorthWest().distanceTo(f.getSouthWest())*f.getNorthEast().distanceTo(f.getNorthWest())<1700&&(d=Tn(e));var p=e.length,m=[];for(n=0;n<p;n++){var ee=O(e[n]);m.push(t.project(O([ee.lat-d.lat,ee.lng-d.lng])))}for(s=c=l=0,n=0,r=p-1;n<p;r=n++)i=m[n],a=m[r],o=i.y*a.x-a.y*i.x,c+=(i.x+a.x)*o,l+=(i.y+a.y)*o,s+=o*3;u=s===0?m[0]:[c/s,l/s];var h=t.unproject(S(u));return O([h.lat+d.lat,h.lng+d.lng])}function Tn(e){for(var t=0,n=0,r=0,i=0;i<e.length;i++){var a=O(e[i]);t+=a.lat,n+=a.lng,r++}return O([t/r,n/r])}var En={__proto__:null,clipPolygon:Cn,polygonCenter:wn,centroid:Tn};function Dn(e,t){if(!t||!e.length)return e.slice();var n=t*t;return e=Mn(e,n),e=An(e,n),e}function On(e,t,n){return Math.sqrt(Rn(e,t,n,!0))}function kn(e,t,n){return Rn(e,t,n)}function An(e,t){var n=e.length,r=new(typeof Uint8Array<`u`?Uint8Array:Array)(n);r[0]=r[n-1]=1,jn(e,r,t,0,n-1);var i,a=[];for(i=0;i<n;i++)r[i]&&a.push(e[i]);return a}function jn(e,t,n,r,i){var a=0,o,s,c;for(s=r+1;s<=i-1;s++)c=Rn(e[s],e[r],e[i],!0),c>a&&(o=s,a=c);a>n&&(t[o]=1,jn(e,t,n,r,o),jn(e,t,n,o,i))}function Mn(e,t){for(var n=[e[0]],r=1,i=0,a=e.length;r<a;r++)Ln(e[r],e[i])>t&&(n.push(e[r]),i=r);return i<a-1&&n.push(e[a-1]),n}var Nn;function Pn(e,t,n,r,i){var a=r?Nn:In(e,n),o=In(t,n),s,c,l;for(Nn=o;;){if(!(a|o))return[e,t];if(a&o)return!1;s=a||o,c=Fn(e,t,s,n,i),l=In(c,n),s===a?(e=c,a=l):(t=c,o=l)}}function Fn(e,t,n,r,i){var a=t.x-e.x,o=t.y-e.y,s=r.min,c=r.max,l,u;return n&8?(l=e.x+a*(c.y-e.y)/o,u=c.y):n&4?(l=e.x+a*(s.y-e.y)/o,u=s.y):n&2?(l=c.x,u=e.y+o*(c.x-e.x)/a):n&1&&(l=s.x,u=e.y+o*(s.x-e.x)/a),new x(l,u,i)}function In(e,t){var n=0;return e.x<t.min.x?n|=1:e.x>t.max.x&&(n|=2),e.y<t.min.y?n|=4:e.y>t.max.y&&(n|=8),n}function Ln(e,t){var n=t.x-e.x,r=t.y-e.y;return n*n+r*r}function Rn(e,t,n,r){var i=t.x,a=t.y,o=n.x-i,s=n.y-a,c=o*o+s*s,l;return c>0&&(l=((e.x-i)*o+(e.y-a)*s)/c,l>1?(i=n.x,a=n.y):l>0&&(i+=o*l,a+=s*l)),o=e.x-i,s=e.y-a,r?o*o+s*s:new x(i,a)}function Y(e){return!g(e[0])||typeof e[0][0]!=`object`&&e[0][0]!==void 0}function zn(e){return console.warn(`Deprecated use of _flat, please use L.LineUtil.isFlat instead.`),Y(e)}function Bn(e,t){var n,r,i,a,o,s,c,l;if(!e||e.length===0)throw Error(`latlngs not passed`);Y(e)||(console.warn(`latlngs are not flat! Only the first ring will be used`),e=e[0]);var u=O([0,0]),d=E(e);d.getNorthWest().distanceTo(d.getSouthWest())*d.getNorthEast().distanceTo(d.getNorthWest())<1700&&(u=Tn(e));var f=e.length,p=[];for(n=0;n<f;n++){var m=O(e[n]);p.push(t.project(O([m.lat-u.lat,m.lng-u.lng])))}for(n=0,r=0;n<f-1;n++)r+=p[n].distanceTo(p[n+1])/2;if(r===0)l=p[0];else for(n=0,a=0;n<f-1;n++)if(o=p[n],s=p[n+1],i=o.distanceTo(s),a+=i,a>r){c=(a-r)/i,l=[s.x-c*(s.x-o.x),s.y-c*(s.y-o.y)];break}var ee=t.unproject(S(l));return O([ee.lat+u.lat,ee.lng+u.lng])}var Vn={__proto__:null,simplify:Dn,pointToSegmentDistance:On,closestPointOnSegment:kn,clipSegment:Pn,_getEdgeIntersection:Fn,_getBitCode:In,_sqClosestPointOnSegment:Rn,isFlat:Y,_flat:zn,polylineCenter:Bn},Hn={project:function(e){return new x(e.lng,e.lat)},unproject:function(e){return new D(e.y,e.x)},bounds:new C([-180,-90],[180,90])},Un={R:6378137,R_MINOR:6356752.314245179,bounds:new C([-20037508.34279,-15496570.73972],[20037508.34279,18764656.23138]),project:function(e){var t=Math.PI/180,n=this.R,r=e.lat*t,i=this.R_MINOR/n,a=Math.sqrt(1-i*i),o=a*Math.sin(r),s=Math.tan(Math.PI/4-r/2)/((1-o)/(1+o))**(a/2);return r=-n*Math.log(Math.max(s,1e-10)),new x(e.lng*t*n,r)},unproject:function(e){for(var t=180/Math.PI,n=this.R,r=this.R_MINOR/n,i=Math.sqrt(1-r*r),a=Math.exp(-e.y/n),o=Math.PI/2-2*Math.atan(a),s=0,c=.1,l;s<15&&Math.abs(c)>1e-7;s++)l=i*Math.sin(o),l=((1-l)/(1+l))**(i/2),c=Math.PI/2-2*Math.atan(a*l)-o,o+=c;return new D(o*t,e.x*t/n)}},Wn={__proto__:null,LonLat:Hn,Mercator:Un,SphericalMercator:he},Gn=n({},pe,{code:`EPSG:3395`,projection:Un,transformation:function(){var e=.5/(Math.PI*Un.R);return _e(e,.5,-e,.5)}()}),Kn=n({},pe,{code:`EPSG:4326`,projection:Hn,transformation:_e(1/180,1,-1/180,.5)}),qn=n({},fe,{projection:Hn,transformation:_e(1,0,-1,0),scale:function(e){return 2**e},zoom:function(e){return Math.log(e)/Math.LN2},distance:function(e,t){var n=t.lng-e.lng,r=t.lat-e.lat;return Math.sqrt(n*n+r*r)},infinite:!0});fe.Earth=pe,fe.EPSG3395=Gn,fe.EPSG3857=ve,fe.EPSG900913=ye,fe.EPSG4326=Kn,fe.Simple=qn;var X=ue.extend({options:{pane:`overlayPane`,attribution:null,bubblingMouseEvents:!0},addTo:function(e){return e.addLayer(this),this},remove:function(){return this.removeFrom(this._map||this._mapToAdd)},removeFrom:function(e){return e&&e.removeLayer(this),this},getPane:function(e){return this._map.getPane(e?this.options[e]||e:this.options.pane)},addInteractiveTarget:function(e){return this._map._targets[o(e)]=this,this},removeInteractiveTarget:function(e){return delete this._map._targets[o(e)],this},getAttribution:function(){return this.options.attribution},_layerAdd:function(e){var t=e.target;if(t.hasLayer(this)){if(this._map=t,this._zoomAnimated=t._zoomAnimated,this.getEvents){var n=this.getEvents();t.on(n,this),this.once(`remove`,function(){t.off(n,this)},this)}this.onAdd(t),this.fire(`add`),t.fire(`layeradd`,{layer:this})}}});K.include({addLayer:function(e){if(!e._layerAdd)throw Error(`The provided object is not a Layer.`);var t=o(e);return this._layers[t]?this:(this._layers[t]=e,e._mapToAdd=this,e.beforeAdd&&e.beforeAdd(this),this.whenReady(e._layerAdd,e),this)},removeLayer:function(e){var t=o(e);return this._layers[t]?(this._loaded&&e.onRemove(this),delete this._layers[t],this._loaded&&(this.fire(`layerremove`,{layer:e}),e.fire(`remove`)),e._map=e._mapToAdd=null,this):this},hasLayer:function(e){return o(e)in this._layers},eachLayer:function(e,t){for(var n in this._layers)e.call(t,this._layers[n]);return this},_addLayers:function(e){e=e?g(e)?e:[e]:[];for(var t=0,n=e.length;t<n;t++)this.addLayer(e[t])},_addZoomLimit:function(e){(!isNaN(e.options.maxZoom)||!isNaN(e.options.minZoom))&&(this._zoomBoundLayers[o(e)]=e,this._updateZoomLevels())},_removeZoomLimit:function(e){var t=o(e);this._zoomBoundLayers[t]&&(delete this._zoomBoundLayers[t],this._updateZoomLevels())},_updateZoomLevels:function(){var e=1/0,t=-1/0,n=this._getZoomSpan();for(var r in this._zoomBoundLayers){var i=this._zoomBoundLayers[r].options;e=i.minZoom===void 0?e:Math.min(e,i.minZoom),t=i.maxZoom===void 0?t:Math.max(t,i.maxZoom)}this._layersMaxZoom=t===-1/0?void 0:t,this._layersMinZoom=e===1/0?void 0:e,n!==this._getZoomSpan()&&this.fire(`zoomlevelschange`),this.options.maxZoom===void 0&&this._layersMaxZoom&&this.getZoom()>this._layersMaxZoom&&this.setZoom(this._layersMaxZoom),this.options.minZoom===void 0&&this._layersMinZoom&&this.getZoom()<this._layersMinZoom&&this.setZoom(this._layersMinZoom)}});var Jn=X.extend({initialize:function(e,t){p(this,t),this._layers={};var n,r;if(e)for(n=0,r=e.length;n<r;n++)this.addLayer(e[n])},addLayer:function(e){var t=this.getLayerId(e);return this._layers[t]=e,this._map&&this._map.addLayer(e),this},removeLayer:function(e){var t=e in this._layers?e:this.getLayerId(e);return this._map&&this._layers[t]&&this._map.removeLayer(this._layers[t]),delete this._layers[t],this},hasLayer:function(e){return(typeof e==`number`?e:this.getLayerId(e))in this._layers},clearLayers:function(){return this.eachLayer(this.removeLayer,this)},invoke:function(e){var t=Array.prototype.slice.call(arguments,1),n,r;for(n in this._layers)r=this._layers[n],r[e]&&r[e].apply(r,t);return this},onAdd:function(e){this.eachLayer(e.addLayer,e)},onRemove:function(e){this.eachLayer(e.removeLayer,e)},eachLayer:function(e,t){for(var n in this._layers)e.call(t,this._layers[n]);return this},getLayer:function(e){return this._layers[e]},getLayers:function(){var e=[];return this.eachLayer(e.push,e),e},setZIndex:function(e){return this.invoke(`setZIndex`,e)},getLayerId:function(e){return o(e)}}),Yn=function(e,t){return new Jn(e,t)},Xn=Jn.extend({addLayer:function(e){return this.hasLayer(e)?this:(e.addEventParent(this),Jn.prototype.addLayer.call(this,e),this.fire(`layeradd`,{layer:e}))},removeLayer:function(e){return this.hasLayer(e)?(e in this._layers&&(e=this._layers[e]),e.removeEventParent(this),Jn.prototype.removeLayer.call(this,e),this.fire(`layerremove`,{layer:e})):this},setStyle:function(e){return this.invoke(`setStyle`,e)},bringToFront:function(){return this.invoke(`bringToFront`)},bringToBack:function(){return this.invoke(`bringToBack`)},getBounds:function(){var e=new T;for(var t in this._layers){var n=this._layers[t];e.extend(n.getBounds?n.getBounds():n.getLatLng())}return e}}),Z=function(e,t){return new Xn(e,t)},Zn=y.extend({options:{popupAnchor:[0,0],tooltipAnchor:[0,0],crossOrigin:!1},initialize:function(e){p(this,e)},createIcon:function(e){return this._createIcon(`icon`,e)},createShadow:function(e){return this._createIcon(`shadow`,e)},_createIcon:function(e,t){var n=this._getIconUrl(e);if(!n){if(e===`icon`)throw Error(`iconUrl not set in Icon options (see the docs).`);return null}var r=this._createImg(n,t&&t.tagName===`IMG`?t:null);return this._setIconStyles(r,e),(this.options.crossOrigin||this.options.crossOrigin===``)&&(r.crossOrigin=this.options.crossOrigin===!0?``:this.options.crossOrigin),r},_setIconStyles:function(e,t){var n=this.options,r=n[t+`Size`];typeof r==`number`&&(r=[r,r]);var i=S(r),a=S(t===`shadow`&&n.shadowAnchor||n.iconAnchor||i&&i.divideBy(2,!0));e.className=`leaflet-marker-`+t+` `+(n.className||``),a&&(e.style.marginLeft=-a.x+`px`,e.style.marginTop=-a.y+`px`),i&&(e.style.width=i.x+`px`,e.style.height=i.y+`px`)},_createImg:function(e,t){return t||=document.createElement(`img`),t.src=e,t},_getIconUrl:function(e){return M.retina&&this.options[e+`RetinaUrl`]||this.options[e+`Url`]}});function Qn(e){return new Zn(e)}var Q=Zn.extend({options:{iconUrl:`marker-icon.png`,iconRetinaUrl:`marker-icon-2x.png`,shadowUrl:`marker-shadow.png`,iconSize:[25,41],iconAnchor:[12,41],popupAnchor:[1,-34],tooltipAnchor:[16,-28],shadowSize:[41,41]},_getIconUrl:function(e){return typeof Q.imagePath!=`string`&&(Q.imagePath=this._detectIconPath()),(this.options.imagePath||Q.imagePath)+Zn.prototype._getIconUrl.call(this,e)},_stripUrl:function(e){var t=function(e,t,n){var r=t.exec(e);return r&&r[n]};return e=t(e,/^url\((['"])?(.+)\1\)$/,2),e&&t(e,/^(.*)marker-icon\.png$/,1)},_detectIconPath:function(){var e=P(`div`,`leaflet-default-icon-path`,document.body),t=Et(e,`background-image`)||Et(e,`backgroundImage`);if(document.body.removeChild(e),t=this._stripUrl(t),t)return t;var n=document.querySelector(`link[href$="leaflet.css"]`);return n?n.href.substring(0,n.href.length-11-1):``}}),$n=bn.extend({initialize:function(e){this._marker=e},addHooks:function(){var e=this._marker._icon;this._draggable||=new Sn(e,e,!0),this._draggable.on({dragstart:this._onDragStart,predrag:this._onPreDrag,drag:this._onDrag,dragend:this._onDragEnd},this).enable(),I(e,`leaflet-marker-draggable`)},removeHooks:function(){this._draggable.off({dragstart:this._onDragStart,predrag:this._onPreDrag,drag:this._onDrag,dragend:this._onDragEnd},this).disable(),this._marker._icon&&R(this._marker._icon,`leaflet-marker-draggable`)},moved:function(){return this._draggable&&this._draggable._moved},_adjustPan:function(e){var t=this._marker,n=t._map,r=this._marker.options.autoPanSpeed,i=this._marker.options.autoPanPadding,a=It(t._icon),o=n.getPixelBounds(),s=n.getPixelOrigin(),c=w(o.min._subtract(s).add(i),o.max._subtract(s).subtract(i));if(!c.contains(a)){var l=S((Math.max(c.max.x,a.x)-c.max.x)/(o.max.x-c.max.x)-(Math.min(c.min.x,a.x)-c.min.x)/(o.min.x-c.min.x),(Math.max(c.max.y,a.y)-c.max.y)/(o.max.y-c.max.y)-(Math.min(c.min.y,a.y)-c.min.y)/(o.min.y-c.min.y)).multiplyBy(r);n.panBy(l,{animate:!1}),this._draggable._newPos._add(l),this._draggable._startPos._add(l),B(t._icon,this._draggable._newPos),this._onDrag(e),this._panRequest=_(this._adjustPan.bind(this,e))}},_onDragStart:function(){this._oldLatLng=this._marker.getLatLng(),this._marker.closePopup&&this._marker.closePopup(),this._marker.fire(`movestart`).fire(`dragstart`)},_onPreDrag:function(e){this._marker.options.autoPan&&(v(this._panRequest),this._panRequest=_(this._adjustPan.bind(this,e)))},_onDrag:function(e){var t=this._marker,n=t._shadow,r=It(t._icon),i=t._map.layerPointToLatLng(r);n&&B(n,r),t._latlng=i,e.latlng=i,e.oldLatLng=this._oldLatLng,t.fire(`move`,e).fire(`drag`,e)},_onDragEnd:function(e){v(this._panRequest),delete this._oldLatLng,this._marker.fire(`moveend`).fire(`dragend`,e)}}),er=X.extend({options:{icon:new Q,interactive:!0,keyboard:!0,title:``,alt:`Marker`,zIndexOffset:0,opacity:1,riseOnHover:!1,riseOffset:250,pane:`markerPane`,shadowPane:`shadowPane`,bubblingMouseEvents:!1,autoPanOnFocus:!0,draggable:!1,autoPan:!1,autoPanPadding:[50,50],autoPanSpeed:10},initialize:function(e,t){p(this,t),this._latlng=O(e)},onAdd:function(e){this._zoomAnimated=this._zoomAnimated&&e.options.markerZoomAnimation,this._zoomAnimated&&e.on(`zoomanim`,this._animateZoom,this),this._initIcon(),this.update()},onRemove:function(e){this.dragging&&this.dragging.enabled()&&(this.options.draggable=!0,this.dragging.removeHooks()),delete this.dragging,this._zoomAnimated&&e.off(`zoomanim`,this._animateZoom,this),this._removeIcon(),this._removeShadow()},getEvents:function(){return{zoom:this.update,viewreset:this.update}},getLatLng:function(){return this._latlng},setLatLng:function(e){var t=this._latlng;return this._latlng=O(e),this.update(),this.fire(`move`,{oldLatLng:t,latlng:this._latlng})},setZIndexOffset:function(e){return this.options.zIndexOffset=e,this.update()},getIcon:function(){return this.options.icon},setIcon:function(e){return this.options.icon=e,this._map&&(this._initIcon(),this.update()),this._popup&&this.bindPopup(this._popup,this._popup.options),this},getElement:function(){return this._icon},update:function(){if(this._icon&&this._map){var e=this._map.latLngToLayerPoint(this._latlng).round();this._setPos(e)}return this},_initIcon:function(){var e=this.options,t=`leaflet-zoom-`+(this._zoomAnimated?`animated`:`hide`),n=e.icon.createIcon(this._icon),r=!1;n!==this._icon&&(this._icon&&this._removeIcon(),r=!0,e.title&&(n.title=e.title),n.tagName===`IMG`&&(n.alt=e.alt||``)),I(n,t),e.keyboard&&(n.tabIndex=`0`,n.setAttribute(`role`,`button`)),this._icon=n,e.riseOnHover&&this.on({mouseover:this._bringToFront,mouseout:this._resetZIndex}),this.options.autoPanOnFocus&&H(n,`focus`,this._panOnFocus,this);var i=e.icon.createShadow(this._shadow),a=!1;i!==this._shadow&&(this._removeShadow(),a=!0),i&&(I(i,t),i.alt=``),this._shadow=i,e.opacity<1&&this._updateOpacity(),r&&this.getPane().appendChild(this._icon),this._initInteraction(),i&&a&&this.getPane(e.shadowPane).appendChild(this._shadow)},_removeIcon:function(){this.options.riseOnHover&&this.off({mouseover:this._bringToFront,mouseout:this._resetZIndex}),this.options.autoPanOnFocus&&W(this._icon,`focus`,this._panOnFocus,this),F(this._icon),this.removeInteractiveTarget(this._icon),this._icon=null},_removeShadow:function(){this._shadow&&F(this._shadow),this._shadow=null},_setPos:function(e){this._icon&&B(this._icon,e),this._shadow&&B(this._shadow,e),this._zIndex=e.y+this.options.zIndexOffset,this._resetZIndex()},_updateZIndex:function(e){this._icon&&(this._icon.style.zIndex=this._zIndex+e)},_animateZoom:function(e){var t=this._map._latLngToNewLayerPoint(this._latlng,e.zoom,e.center).round();this._setPos(t)},_initInteraction:function(){if(this.options.interactive&&(I(this._icon,`leaflet-interactive`),this.addInteractiveTarget(this._icon),$n)){var e=this.options.draggable;this.dragging&&(e=this.dragging.enabled(),this.dragging.disable()),this.dragging=new $n(this),e&&this.dragging.enable()}},setOpacity:function(e){return this.options.opacity=e,this._map&&this._updateOpacity(),this},_updateOpacity:function(){var e=this.options.opacity;this._icon&&z(this._icon,e),this._shadow&&z(this._shadow,e)},_bringToFront:function(){this._updateZIndex(this.options.riseOffset)},_resetZIndex:function(){this._updateZIndex(0)},_panOnFocus:function(){var e=this._map;if(e){var t=this.options.icon.options,n=t.iconSize?S(t.iconSize):S(0,0),r=t.iconAnchor?S(t.iconAnchor):S(0,0);e.panInside(this._latlng,{paddingTopLeft:r,paddingBottomRight:n.subtract(r)})}},_getPopupAnchor:function(){return this.options.icon.options.popupAnchor},_getTooltipAnchor:function(){return this.options.icon.options.tooltipAnchor}});function tr(e,t){return new er(e,t)}var nr=X.extend({options:{stroke:!0,color:`#3388ff`,weight:3,opacity:1,lineCap:`round`,lineJoin:`round`,dashArray:null,dashOffset:null,fill:!1,fillColor:null,fillOpacity:.2,fillRule:`evenodd`,interactive:!0,bubblingMouseEvents:!0},beforeAdd:function(e){this._renderer=e.getRenderer(this)},onAdd:function(){this._renderer._initPath(this),this._reset(),this._renderer._addPath(this)},onRemove:function(){this._renderer._removePath(this)},redraw:function(){return this._map&&this._renderer._updatePath(this),this},setStyle:function(e){return p(this,e),this._renderer&&(this._renderer._updateStyle(this),this.options.stroke&&e&&Object.prototype.hasOwnProperty.call(e,`weight`)&&this._updateBounds()),this},bringToFront:function(){return this._renderer&&this._renderer._bringToFront(this),this},bringToBack:function(){return this._renderer&&this._renderer._bringToBack(this),this},getElement:function(){return this._path},_reset:function(){this._project(),this._update()},_clickTolerance:function(){return(this.options.stroke?this.options.weight/2:0)+(this._renderer.options.tolerance||0)}}),rr=nr.extend({options:{fill:!0,radius:10},initialize:function(e,t){p(this,t),this._latlng=O(e),this._radius=this.options.radius},setLatLng:function(e){var t=this._latlng;return this._latlng=O(e),this.redraw(),this.fire(`move`,{oldLatLng:t,latlng:this._latlng})},getLatLng:function(){return this._latlng},setRadius:function(e){return this.options.radius=this._radius=e,this.redraw()},getRadius:function(){return this._radius},setStyle:function(e){var t=e&&e.radius||this._radius;return nr.prototype.setStyle.call(this,e),this.setRadius(t),this},_project:function(){this._point=this._map.latLngToLayerPoint(this._latlng),this._updateBounds()},_updateBounds:function(){var e=this._radius,t=this._radiusY||e,n=this._clickTolerance(),r=[e+n,t+n];this._pxBounds=new C(this._point.subtract(r),this._point.add(r))},_update:function(){this._map&&this._updatePath()},_updatePath:function(){this._renderer._updateCircle(this)},_empty:function(){return this._radius&&!this._renderer._bounds.intersects(this._pxBounds)},_containsPoint:function(e){return e.distanceTo(this._point)<=this._radius+this._clickTolerance()}});function ir(e,t){return new rr(e,t)}var ar=rr.extend({initialize:function(e,t,r){if(typeof t==`number`&&(t=n({},r,{radius:t})),p(this,t),this._latlng=O(e),isNaN(this.options.radius))throw Error(`Circle radius cannot be NaN`);this._mRadius=this.options.radius},setRadius:function(e){return this._mRadius=e,this.redraw()},getRadius:function(){return this._mRadius},getBounds:function(){var e=[this._radius,this._radiusY||this._radius];return new T(this._map.layerPointToLatLng(this._point.subtract(e)),this._map.layerPointToLatLng(this._point.add(e)))},setStyle:nr.prototype.setStyle,_project:function(){var e=this._latlng.lng,t=this._latlng.lat,n=this._map,r=n.options.crs;if(r.distance===pe.distance){var i=Math.PI/180,a=this._mRadius/pe.R/i,o=n.project([t+a,e]),s=n.project([t-a,e]),c=o.add(s).divideBy(2),l=n.unproject(c).lat,u=Math.acos((Math.cos(a*i)-Math.sin(t*i)*Math.sin(l*i))/(Math.cos(t*i)*Math.cos(l*i)))/i;(isNaN(u)||u===0)&&(u=a/Math.cos(Math.PI/180*t)),this._point=c.subtract(n.getPixelOrigin()),this._radius=isNaN(u)?0:c.x-n.project([l,e-u]).x,this._radiusY=c.y-o.y}else{var d=r.unproject(r.project(this._latlng).subtract([this._mRadius,0]));this._point=n.latLngToLayerPoint(this._latlng),this._radius=this._point.x-n.latLngToLayerPoint(d).x}this._updateBounds()}});function or(e,t,n){return new ar(e,t,n)}var $=nr.extend({options:{smoothFactor:1,noClip:!1},initialize:function(e,t){p(this,t),this._setLatLngs(e)},getLatLngs:function(){return this._latlngs},setLatLngs:function(e){return this._setLatLngs(e),this.redraw()},isEmpty:function(){return!this._latlngs.length},closestLayerPoint:function(e){for(var t=1/0,n=null,r=Rn,i,a,o=0,s=this._parts.length;o<s;o++)for(var c=this._parts[o],l=1,u=c.length;l<u;l++){i=c[l-1],a=c[l];var d=r(e,i,a,!0);d<t&&(t=d,n=r(e,i,a))}return n&&(n.distance=Math.sqrt(t)),n},getCenter:function(){if(!this._map)throw Error(`Must add layer to map before using getCenter()`);return Bn(this._defaultShape(),this._map.options.crs)},getBounds:function(){return this._bounds},addLatLng:function(e,t){return t||=this._defaultShape(),e=O(e),t.push(e),this._bounds.extend(e),this.redraw()},_setLatLngs:function(e){this._bounds=new T,this._latlngs=this._convertLatLngs(e)},_defaultShape:function(){return Y(this._latlngs)?this._latlngs:this._latlngs[0]},_convertLatLngs:function(e){for(var t=[],n=Y(e),r=0,i=e.length;r<i;r++)n?(t[r]=O(e[r]),this._bounds.extend(t[r])):t[r]=this._convertLatLngs(e[r]);return t},_project:function(){var e=new C;this._rings=[],this._projectLatlngs(this._latlngs,this._rings,e),this._bounds.isValid()&&e.isValid()&&(this._rawPxBounds=e,this._updateBounds())},_updateBounds:function(){var e=this._clickTolerance(),t=new x(e,e);this._rawPxBounds&&(this._pxBounds=new C([this._rawPxBounds.min.subtract(t),this._rawPxBounds.max.add(t)]))},_projectLatlngs:function(e,t,n){var r=e[0]instanceof D,i=e.length,a,o;if(r){for(o=[],a=0;a<i;a++)o[a]=this._map.latLngToLayerPoint(e[a]),n.extend(o[a]);t.push(o)}else for(a=0;a<i;a++)this._projectLatlngs(e[a],t,n)},_clipPoints:function(){var e=this._renderer._bounds;if(this._parts=[],!(!this._pxBounds||!this._pxBounds.intersects(e))){if(this.options.noClip){this._parts=this._rings;return}var t=this._parts,n,r,i,a,o,s,c;for(n=0,i=0,a=this._rings.length;n<a;n++)for(c=this._rings[n],r=0,o=c.length;r<o-1;r++)s=Pn(c[r],c[r+1],e,r,!0),s&&(t[i]=t[i]||[],t[i].push(s[0]),(s[1]!==c[r+1]||r===o-2)&&(t[i].push(s[1]),i++))}},_simplifyPoints:function(){for(var e=this._parts,t=this.options.smoothFactor,n=0,r=e.length;n<r;n++)e[n]=Dn(e[n],t)},_update:function(){this._map&&(this._clipPoints(),this._simplifyPoints(),this._updatePath())},_updatePath:function(){this._renderer._updatePoly(this)},_containsPoint:function(e,t){var n,r,i,a,o,s,c=this._clickTolerance();if(!this._pxBounds||!this._pxBounds.contains(e))return!1;for(n=0,a=this._parts.length;n<a;n++)for(s=this._parts[n],r=0,o=s.length,i=o-1;r<o;i=r++)if(!(!t&&r===0)&&On(e,s[i],s[r])<=c)return!0;return!1}});function sr(e,t){return new $(e,t)}$._flat=zn;var cr=$.extend({options:{fill:!0},isEmpty:function(){return!this._latlngs.length||!this._latlngs[0].length},getCenter:function(){if(!this._map)throw Error(`Must add layer to map before using getCenter()`);return wn(this._defaultShape(),this._map.options.crs)},_convertLatLngs:function(e){var t=$.prototype._convertLatLngs.call(this,e),n=t.length;return n>=2&&t[0]instanceof D&&t[0].equals(t[n-1])&&t.pop(),t},_setLatLngs:function(e){$.prototype._setLatLngs.call(this,e),Y(this._latlngs)&&(this._latlngs=[this._latlngs])},_defaultShape:function(){return Y(this._latlngs[0])?this._latlngs[0]:this._latlngs[0][0]},_clipPoints:function(){var e=this._renderer._bounds,t=this.options.weight,n=new x(t,t);if(e=new C(e.min.subtract(n),e.max.add(n)),this._parts=[],!(!this._pxBounds||!this._pxBounds.intersects(e))){if(this.options.noClip){this._parts=this._rings;return}for(var r=0,i=this._rings.length,a;r<i;r++)a=Cn(this._rings[r],e,!0),a.length&&this._parts.push(a)}},_updatePath:function(){this._renderer._updatePoly(this,!0)},_containsPoint:function(e){var t=!1,n,r,i,a,o,s,c,l;if(!this._pxBounds||!this._pxBounds.contains(e))return!1;for(a=0,c=this._parts.length;a<c;a++)for(n=this._parts[a],o=0,l=n.length,s=l-1;o<l;s=o++)r=n[o],i=n[s],r.y>e.y!=i.y>e.y&&e.x<(i.x-r.x)*(e.y-r.y)/(i.y-r.y)+r.x&&(t=!t);return t||$.prototype._containsPoint.call(this,e,!0)}});function lr(e,t){return new cr(e,t)}var ur=Xn.extend({initialize:function(e,t){p(this,t),this._layers={},e&&this.addData(e)},addData:function(e){var t=g(e)?e:e.features,n,r,i;if(t){for(n=0,r=t.length;n<r;n++)i=t[n],(i.geometries||i.geometry||i.features||i.coordinates)&&this.addData(i);return this}var a=this.options;if(a.filter&&!a.filter(e))return this;var o=dr(e,a);return o?(o.feature=vr(e),o.defaultOptions=o.options,this.resetStyle(o),a.onEachFeature&&a.onEachFeature(e,o),this.addLayer(o)):this},resetStyle:function(e){return e===void 0?this.eachLayer(this.resetStyle,this):(e.options=n({},e.defaultOptions),this._setLayerStyle(e,this.options.style),this)},setStyle:function(e){return this.eachLayer(function(t){this._setLayerStyle(t,e)},this)},_setLayerStyle:function(e,t){e.setStyle&&(typeof t==`function`&&(t=t(e.feature)),e.setStyle(t))}});function dr(e,t){var n=e.type===`Feature`?e.geometry:e,r=n?n.coordinates:null,i=[],a=t&&t.pointToLayer,o=t&&t.coordsToLatLng||pr,s,c,l,u;if(!r&&!n)return null;switch(n.type){case`Point`:return s=o(r),fr(a,e,s,t);case`MultiPoint`:for(l=0,u=r.length;l<u;l++)s=o(r[l]),i.push(fr(a,e,s,t));return new Xn(i);case`LineString`:case`MultiLineString`:return c=mr(r,n.type===`LineString`?0:1,o),new $(c,t);case`Polygon`:case`MultiPolygon`:return c=mr(r,n.type===`Polygon`?1:2,o),new cr(c,t);case`GeometryCollection`:for(l=0,u=n.geometries.length;l<u;l++){var d=dr({geometry:n.geometries[l],type:`Feature`,properties:e.properties},t);d&&i.push(d)}return new Xn(i);case`FeatureCollection`:for(l=0,u=n.features.length;l<u;l++){var f=dr(n.features[l],t);f&&i.push(f)}return new Xn(i);default:throw Error(`Invalid GeoJSON object.`)}}function fr(e,t,n,r){return e?e(t,n):new er(n,r&&r.markersInheritOptions&&r)}function pr(e){return new D(e[1],e[0],e[2])}function mr(e,t,n){for(var r=[],i=0,a=e.length,o;i<a;i++)o=t?mr(e[i],t-1,n):(n||pr)(e[i]),r.push(o);return r}function hr(e,t){return e=O(e),e.alt===void 0?[u(e.lng,t),u(e.lat,t)]:[u(e.lng,t),u(e.lat,t),u(e.alt,t)]}function gr(e,t,n,r){for(var i=[],a=0,o=e.length;a<o;a++)i.push(t?gr(e[a],Y(e[a])?0:t-1,n,r):hr(e[a],r));return!t&&n&&i.length>0&&i.push(i[0].slice()),i}function _r(e,t){return e.feature?n({},e.feature,{geometry:t}):vr(t)}function vr(e){return e.type===`Feature`||e.type===`FeatureCollection`?e:{type:`Feature`,properties:{},geometry:e}}var yr={toGeoJSON:function(e){return _r(this,{type:`Point`,coordinates:hr(this.getLatLng(),e)})}};er.include(yr),ar.include(yr),rr.include(yr),$.include({toGeoJSON:function(e){var t=!Y(this._latlngs),n=gr(this._latlngs,+!!t,!1,e);return _r(this,{type:(t?`Multi`:``)+`LineString`,coordinates:n})}}),cr.include({toGeoJSON:function(e){var t=!Y(this._latlngs),n=t&&!Y(this._latlngs[0]),r=gr(this._latlngs,n?2:+!!t,!0,e);return t||(r=[r]),_r(this,{type:(n?`Multi`:``)+`Polygon`,coordinates:r})}}),Jn.include({toMultiPoint:function(e){var t=[];return this.eachLayer(function(n){t.push(n.toGeoJSON(e).geometry.coordinates)}),_r(this,{type:`MultiPoint`,coordinates:t})},toGeoJSON:function(e){var t=this.feature&&this.feature.geometry&&this.feature.geometry.type;if(t===`MultiPoint`)return this.toMultiPoint(e);var n=t===`GeometryCollection`,r=[];return this.eachLayer(function(t){if(t.toGeoJSON){var i=t.toGeoJSON(e);if(n)r.push(i.geometry);else{var a=vr(i);a.type===`FeatureCollection`?r.push.apply(r,a.features):r.push(a)}}}),n?_r(this,{geometries:r,type:`GeometryCollection`}):{type:`FeatureCollection`,features:r}}});function br(e,t){return new ur(e,t)}var xr=br,Sr=X.extend({options:{opacity:1,alt:``,interactive:!1,crossOrigin:!1,errorOverlayUrl:``,zIndex:1,className:``},initialize:function(e,t,n){this._url=e,this._bounds=E(t),p(this,n)},onAdd:function(){this._image||(this._initImage(),this.options.opacity<1&&this._updateOpacity()),this.options.interactive&&(I(this._image,`leaflet-interactive`),this.addInteractiveTarget(this._image)),this.getPane().appendChild(this._image),this._reset()},onRemove:function(){F(this._image),this.options.interactive&&this.removeInteractiveTarget(this._image)},setOpacity:function(e){return this.options.opacity=e,this._image&&this._updateOpacity(),this},setStyle:function(e){return e.opacity&&this.setOpacity(e.opacity),this},bringToFront:function(){return this._map&&Ot(this._image),this},bringToBack:function(){return this._map&&kt(this._image),this},setUrl:function(e){return this._url=e,this._image&&(this._image.src=e),this},setBounds:function(e){return this._bounds=E(e),this._map&&this._reset(),this},getEvents:function(){var e={zoom:this._reset,viewreset:this._reset};return this._zoomAnimated&&(e.zoomanim=this._animateZoom),e},setZIndex:function(e){return this.options.zIndex=e,this._updateZIndex(),this},getBounds:function(){return this._bounds},getElement:function(){return this._image},_initImage:function(){var e=this._url.tagName===`IMG`,t=this._image=e?this._url:P(`img`);if(I(t,`leaflet-image-layer`),this._zoomAnimated&&I(t,`leaflet-zoom-animated`),this.options.className&&I(t,this.options.className),t.onselectstart=l,t.onmousemove=l,t.onload=i(this.fire,this,`load`),t.onerror=i(this._overlayOnError,this,`error`),(this.options.crossOrigin||this.options.crossOrigin===``)&&(t.crossOrigin=this.options.crossOrigin===!0?``:this.options.crossOrigin),this.options.zIndex&&this._updateZIndex(),e){this._url=t.src;return}t.src=this._url,t.alt=this.options.alt},_animateZoom:function(e){var t=this._map.getZoomScale(e.zoom),n=this._map._latLngBoundsToNewLayerBounds(this._bounds,e.zoom,e.center).min;Ft(this._image,n,t)},_reset:function(){var e=this._image,t=new C(this._map.latLngToLayerPoint(this._bounds.getNorthWest()),this._map.latLngToLayerPoint(this._bounds.getSouthEast())),n=t.getSize();B(e,t.min),e.style.width=n.x+`px`,e.style.height=n.y+`px`},_updateOpacity:function(){z(this._image,this.options.opacity)},_updateZIndex:function(){this._image&&this.options.zIndex!==void 0&&this.options.zIndex!==null&&(this._image.style.zIndex=this.options.zIndex)},_overlayOnError:function(){this.fire(`error`);var e=this.options.errorOverlayUrl;e&&this._url!==e&&(this._url=e,this._image.src=e)},getCenter:function(){return this._bounds.getCenter()}}),Cr=function(e,t,n){return new Sr(e,t,n)},wr=Sr.extend({options:{autoplay:!0,loop:!0,keepAspectRatio:!0,muted:!1,playsInline:!0},_initImage:function(){var e=this._url.tagName===`VIDEO`,t=this._image=e?this._url:P(`video`);if(I(t,`leaflet-image-layer`),this._zoomAnimated&&I(t,`leaflet-zoom-animated`),this.options.className&&I(t,this.options.className),t.onselectstart=l,t.onmousemove=l,t.onloadeddata=i(this.fire,this,`load`),e){for(var n=t.getElementsByTagName(`source`),r=[],a=0;a<n.length;a++)r.push(n[a].src);this._url=n.length>0?r:[t.src];return}g(this._url)||(this._url=[this._url]),!this.options.keepAspectRatio&&Object.prototype.hasOwnProperty.call(t.style,`objectFit`)&&(t.style.objectFit=`fill`),t.autoplay=!!this.options.autoplay,t.loop=!!this.options.loop,t.muted=!!this.options.muted,t.playsInline=!!this.options.playsInline;for(var o=0;o<this._url.length;o++){var s=P(`source`);s.src=this._url[o],t.appendChild(s)}}});function Tr(e,t,n){return new wr(e,t,n)}var Er=Sr.extend({_initImage:function(){var e=this._image=this._url;I(e,`leaflet-image-layer`),this._zoomAnimated&&I(e,`leaflet-zoom-animated`),this.options.className&&I(e,this.options.className),e.onselectstart=l,e.onmousemove=l}});function Dr(e,t,n){return new Er(e,t,n)}var Or=X.extend({options:{interactive:!1,offset:[0,0],className:``,pane:void 0,content:``},initialize:function(e,t){e&&(e instanceof D||g(e))?(this._latlng=O(e),p(this,t)):(p(this,e),this._source=t),this.options.content&&(this._content=this.options.content)},openOn:function(e){return e=arguments.length?e:this._source._map,e.hasLayer(this)||e.addLayer(this),this},close:function(){return this._map&&this._map.removeLayer(this),this},toggle:function(e){return this._map?this.close():(arguments.length?this._source=e:e=this._source,this._prepareOpen(),this.openOn(e._map)),this},onAdd:function(e){this._zoomAnimated=e._zoomAnimated,this._container||this._initLayout(),e._fadeAnimated&&z(this._container,0),clearTimeout(this._removeTimeout),this.getPane().appendChild(this._container),this.update(),e._fadeAnimated&&z(this._container,1),this.bringToFront(),this.options.interactive&&(I(this._container,`leaflet-interactive`),this.addInteractiveTarget(this._container))},onRemove:function(e){e._fadeAnimated?(z(this._container,0),this._removeTimeout=setTimeout(i(F,void 0,this._container),200)):F(this._container),this.options.interactive&&(R(this._container,`leaflet-interactive`),this.removeInteractiveTarget(this._container))},getLatLng:function(){return this._latlng},setLatLng:function(e){return this._latlng=O(e),this._map&&(this._updatePosition(),this._adjustPan()),this},getContent:function(){return this._content},setContent:function(e){return this._content=e,this.update(),this},getElement:function(){return this._container},update:function(){this._map&&(this._container.style.visibility=`hidden`,this._updateContent(),this._updateLayout(),this._updatePosition(),this._container.style.visibility=``,this._adjustPan())},getEvents:function(){var e={zoom:this._updatePosition,viewreset:this._updatePosition};return this._zoomAnimated&&(e.zoomanim=this._animateZoom),e},isOpen:function(){return!!this._map&&this._map.hasLayer(this)},bringToFront:function(){return this._map&&Ot(this._container),this},bringToBack:function(){return this._map&&kt(this._container),this},_prepareOpen:function(e){var t=this._source;if(!t._map)return!1;if(t instanceof Xn){t=null;var n=this._source._layers;for(var r in n)if(n[r]._map){t=n[r];break}if(!t)return!1;this._source=t}if(!e)if(t.getCenter)e=t.getCenter();else if(t.getLatLng)e=t.getLatLng();else if(t.getBounds)e=t.getBounds().getCenter();else throw Error(`Unable to get source layer LatLng.`);return this.setLatLng(e),this._map&&this.update(),!0},_updateContent:function(){if(this._content){var e=this._contentNode,t=typeof this._content==`function`?this._content(this._source||this):this._content;if(typeof t==`string`)e.innerHTML=t;else{for(;e.hasChildNodes();)e.removeChild(e.firstChild);e.appendChild(t)}this.fire(`contentupdate`)}},_updatePosition:function(){if(this._map){var e=this._map.latLngToLayerPoint(this._latlng),t=S(this.options.offset),n=this._getAnchor();this._zoomAnimated?B(this._container,e.add(n)):t=t.add(e).add(n);var r=this._containerBottom=-t.y,i=this._containerLeft=-Math.round(this._containerWidth/2)+t.x;this._container.style.bottom=r+`px`,this._container.style.left=i+`px`}},_getAnchor:function(){return[0,0]}});K.include({_initOverlay:function(e,t,n,r){var i=t;return i instanceof e||(i=new e(r).setContent(t)),n&&i.setLatLng(n),i}}),X.include({_initOverlay:function(e,t,n,r){var i=n;return i instanceof e?(p(i,r),i._source=this):(i=t&&!r?t:new e(r,this),i.setContent(n)),i}});var kr=Or.extend({options:{pane:`popupPane`,offset:[0,7],maxWidth:300,minWidth:50,maxHeight:null,autoPan:!0,autoPanPaddingTopLeft:null,autoPanPaddingBottomRight:null,autoPanPadding:[5,5],keepInView:!1,closeButton:!0,autoClose:!0,closeOnEscapeKey:!0,className:``},openOn:function(e){return e=arguments.length?e:this._source._map,!e.hasLayer(this)&&e._popup&&e._popup.options.autoClose&&e.removeLayer(e._popup),e._popup=this,Or.prototype.openOn.call(this,e)},onAdd:function(e){Or.prototype.onAdd.call(this,e),e.fire(`popupopen`,{popup:this}),this._source&&(this._source.fire(`popupopen`,{popup:this},!0),this._source instanceof nr||this._source.on(`preclick`,$t))},onRemove:function(e){Or.prototype.onRemove.call(this,e),e.fire(`popupclose`,{popup:this}),this._source&&(this._source.fire(`popupclose`,{popup:this},!0),this._source instanceof nr||this._source.off(`preclick`,$t))},getEvents:function(){var e=Or.prototype.getEvents.call(this);return(this.options.closeOnClick===void 0?this._map.options.closePopupOnClick:this.options.closeOnClick)&&(e.preclick=this.close),this.options.keepInView&&(e.moveend=this._adjustPan),e},_initLayout:function(){var e=`leaflet-popup`,t=this._container=P(`div`,e+` `+(this.options.className||``)+` leaflet-zoom-animated`),n=this._wrapper=P(`div`,e+`-content-wrapper`,t);if(this._contentNode=P(`div`,e+`-content`,n),tn(t),en(this._contentNode),H(t,`contextmenu`,$t),this._tipContainer=P(`div`,e+`-tip-container`,t),this._tip=P(`div`,e+`-tip`,this._tipContainer),this.options.closeButton){var r=this._closeButton=P(`a`,e+`-close-button`,t);r.setAttribute(`role`,`button`),r.setAttribute(`aria-label`,`Close popup`),r.href=`#close`,r.innerHTML=`<span aria-hidden="true">&#215;</span>`,H(r,`click`,function(e){G(e),this.close()},this)}},_updateLayout:function(){var e=this._contentNode,t=e.style;t.width=``,t.whiteSpace=`nowrap`;var n=e.offsetWidth;n=Math.min(n,this.options.maxWidth),n=Math.max(n,this.options.minWidth),t.width=n+1+`px`,t.whiteSpace=``,t.height=``;var r=e.offsetHeight,i=this.options.maxHeight,a=`leaflet-popup-scrolled`;i&&r>i?(t.height=i+`px`,I(e,a)):R(e,a),this._containerWidth=this._container.offsetWidth},_animateZoom:function(e){var t=this._map._latLngToNewLayerPoint(this._latlng,e.zoom,e.center),n=this._getAnchor();B(this._container,t.add(n))},_adjustPan:function(){if(this.options.autoPan){if(this._map._panAnim&&this._map._panAnim.stop(),this._autopanning){this._autopanning=!1;return}var e=this._map,t=parseInt(Et(this._container,`marginBottom`),10)||0,n=this._container.offsetHeight+t,r=this._containerWidth,i=new x(this._containerLeft,-n-this._containerBottom);i._add(It(this._container));var a=e.layerPointToContainerPoint(i),o=S(this.options.autoPanPadding),s=S(this.options.autoPanPaddingTopLeft||o),c=S(this.options.autoPanPaddingBottomRight||o),l=e.getSize(),u=0,d=0;a.x+r+c.x>l.x&&(u=a.x+r-l.x+c.x),a.x-u-s.x<0&&(u=a.x-s.x),a.y+n+c.y>l.y&&(d=a.y+n-l.y+c.y),a.y-d-s.y<0&&(d=a.y-s.y),(u||d)&&(this.options.keepInView&&(this._autopanning=!0),e.fire(`autopanstart`).panBy([u,d]))}},_getAnchor:function(){return S(this._source&&this._source._getPopupAnchor?this._source._getPopupAnchor():[0,0])}}),Ar=function(e,t){return new kr(e,t)};K.mergeOptions({closePopupOnClick:!0}),K.include({openPopup:function(e,t,n){return this._initOverlay(kr,e,t,n).openOn(this),this},closePopup:function(e){return e=arguments.length?e:this._popup,e&&e.close(),this}}),X.include({bindPopup:function(e,t){return this._popup=this._initOverlay(kr,this._popup,e,t),this._popupHandlersAdded||=(this.on({click:this._openPopup,keypress:this._onKeyPress,remove:this.closePopup,move:this._movePopup}),!0),this},unbindPopup:function(){return this._popup&&=(this.off({click:this._openPopup,keypress:this._onKeyPress,remove:this.closePopup,move:this._movePopup}),this._popupHandlersAdded=!1,null),this},openPopup:function(e){return this._popup&&(this instanceof Xn||(this._popup._source=this),this._popup._prepareOpen(e||this._latlng)&&this._popup.openOn(this._map)),this},closePopup:function(){return this._popup&&this._popup.close(),this},togglePopup:function(){return this._popup&&this._popup.toggle(this),this},isPopupOpen:function(){return this._popup?this._popup.isOpen():!1},setPopupContent:function(e){return this._popup&&this._popup.setContent(e),this},getPopup:function(){return this._popup},_openPopup:function(e){if(!(!this._popup||!this._map)){nn(e);var t=e.layer||e.target;if(this._popup._source===t&&!(t instanceof nr)){this._map.hasLayer(this._popup)?this.closePopup():this.openPopup(e.latlng);return}this._popup._source=t,this.openPopup(e.latlng)}},_movePopup:function(e){this._popup.setLatLng(e.latlng)},_onKeyPress:function(e){e.originalEvent.keyCode===13&&this._openPopup(e)}});var jr=Or.extend({options:{pane:`tooltipPane`,offset:[0,0],direction:`auto`,permanent:!1,sticky:!1,opacity:.9},onAdd:function(e){Or.prototype.onAdd.call(this,e),this.setOpacity(this.options.opacity),e.fire(`tooltipopen`,{tooltip:this}),this._source&&(this.addEventParent(this._source),this._source.fire(`tooltipopen`,{tooltip:this},!0))},onRemove:function(e){Or.prototype.onRemove.call(this,e),e.fire(`tooltipclose`,{tooltip:this}),this._source&&(this.removeEventParent(this._source),this._source.fire(`tooltipclose`,{tooltip:this},!0))},getEvents:function(){var e=Or.prototype.getEvents.call(this);return this.options.permanent||(e.preclick=this.close),e},_initLayout:function(){var e=`leaflet-tooltip `+(this.options.className||``)+` leaflet-zoom-`+(this._zoomAnimated?`animated`:`hide`);this._contentNode=this._container=P(`div`,e),this._container.setAttribute(`role`,`tooltip`),this._container.setAttribute(`id`,`leaflet-tooltip-`+o(this))},_updateLayout:function(){},_adjustPan:function(){},_setPosition:function(e){var t,n,r=this._map,i=this._container,a=r.latLngToContainerPoint(r.getCenter()),o=r.layerPointToContainerPoint(e),s=this.options.direction,c=i.offsetWidth,l=i.offsetHeight,u=S(this.options.offset),d=this._getAnchor();s===`top`?(t=c/2,n=l):s===`bottom`?(t=c/2,n=0):s===`center`?(t=c/2,n=l/2):s===`right`?(t=0,n=l/2):s===`left`?(t=c,n=l/2):o.x<a.x?(s=`right`,t=0,n=l/2):(s=`left`,t=c+(u.x+d.x)*2,n=l/2),e=e.subtract(S(t,n,!0)).add(u).add(d),R(i,`leaflet-tooltip-right`),R(i,`leaflet-tooltip-left`),R(i,`leaflet-tooltip-top`),R(i,`leaflet-tooltip-bottom`),I(i,`leaflet-tooltip-`+s),B(i,e)},_updatePosition:function(){var e=this._map.latLngToLayerPoint(this._latlng);this._setPosition(e)},setOpacity:function(e){this.options.opacity=e,this._container&&z(this._container,e)},_animateZoom:function(e){var t=this._map._latLngToNewLayerPoint(this._latlng,e.zoom,e.center);this._setPosition(t)},_getAnchor:function(){return S(this._source&&this._source._getTooltipAnchor&&!this.options.sticky?this._source._getTooltipAnchor():[0,0])}}),Mr=function(e,t){return new jr(e,t)};K.include({openTooltip:function(e,t,n){return this._initOverlay(jr,e,t,n).openOn(this),this},closeTooltip:function(e){return e.close(),this}}),X.include({bindTooltip:function(e,t){return this._tooltip&&this.isTooltipOpen()&&this.unbindTooltip(),this._tooltip=this._initOverlay(jr,this._tooltip,e,t),this._initTooltipInteractions(),this._tooltip.options.permanent&&this._map&&this._map.hasLayer(this)&&this.openTooltip(),this},unbindTooltip:function(){return this._tooltip&&=(this._initTooltipInteractions(!0),this.closeTooltip(),null),this},_initTooltipInteractions:function(e){if(!(!e&&this._tooltipHandlersAdded)){var t=e?`off`:`on`,n={remove:this.closeTooltip,move:this._moveTooltip};this._tooltip.options.permanent?n.add=this._openTooltip:(n.mouseover=this._openTooltip,n.mouseout=this.closeTooltip,n.click=this._openTooltip,this._map?this._addFocusListeners():n.add=this._addFocusListeners),this._tooltip.options.sticky&&(n.mousemove=this._moveTooltip),this[t](n),this._tooltipHandlersAdded=!e}},openTooltip:function(e){return this._tooltip&&(this instanceof Xn||(this._tooltip._source=this),this._tooltip._prepareOpen(e)&&(this._tooltip.openOn(this._map),this.getElement?this._setAriaDescribedByOnLayer(this):this.eachLayer&&this.eachLayer(this._setAriaDescribedByOnLayer,this))),this},closeTooltip:function(){if(this._tooltip)return this._tooltip.close()},toggleTooltip:function(){return this._tooltip&&this._tooltip.toggle(this),this},isTooltipOpen:function(){return this._tooltip.isOpen()},setTooltipContent:function(e){return this._tooltip&&this._tooltip.setContent(e),this},getTooltip:function(){return this._tooltip},_addFocusListeners:function(){this.getElement?this._addFocusListenersOnLayer(this):this.eachLayer&&this.eachLayer(this._addFocusListenersOnLayer,this)},_addFocusListenersOnLayer:function(e){var t=typeof e.getElement==`function`&&e.getElement();t&&(H(t,`focus`,function(){this._tooltip._source=e,this.openTooltip()},this),H(t,`blur`,this.closeTooltip,this))},_setAriaDescribedByOnLayer:function(e){var t=typeof e.getElement==`function`&&e.getElement();t&&t.setAttribute(`aria-describedby`,this._tooltip._container.id)},_openTooltip:function(e){if(!(!this._tooltip||!this._map)){if(this._map.dragging&&this._map.dragging.moving()&&!this._openOnceFlag){this._openOnceFlag=!0;var t=this;this._map.once(`moveend`,function(){t._openOnceFlag=!1,t._openTooltip(e)});return}this._tooltip._source=e.layer||e.target,this.openTooltip(this._tooltip.options.sticky?e.latlng:void 0)}},_moveTooltip:function(e){var t=e.latlng,n,r;this._tooltip.options.sticky&&e.originalEvent&&(n=this._map.mouseEventToContainerPoint(e.originalEvent),r=this._map.containerPointToLayerPoint(n),t=this._map.layerPointToLatLng(r)),this._tooltip.setLatLng(t)}});var Nr=Zn.extend({options:{iconSize:[12,12],html:!1,bgPos:null,className:`leaflet-div-icon`},createIcon:function(e){var t=e&&e.tagName===`DIV`?e:document.createElement(`div`),n=this.options;if(n.html instanceof Element?(Dt(t),t.appendChild(n.html)):t.innerHTML=n.html===!1?``:n.html,n.bgPos){var r=S(n.bgPos);t.style.backgroundPosition=-r.x+`px `+-r.y+`px`}return this._setIconStyles(t,`icon`),t},createShadow:function(){return null}});function Pr(e){return new Nr(e)}Zn.Default=Q;var Fr=X.extend({options:{tileSize:256,opacity:1,updateWhenIdle:M.mobile,updateWhenZooming:!0,updateInterval:200,zIndex:1,bounds:null,minZoom:0,maxZoom:void 0,maxNativeZoom:void 0,minNativeZoom:void 0,noWrap:!1,pane:`tilePane`,className:``,keepBuffer:2},initialize:function(e){p(this,e)},onAdd:function(){this._initContainer(),this._levels={},this._tiles={},this._resetView()},beforeAdd:function(e){e._addZoomLimit(this)},onRemove:function(e){this._removeAllTiles(),F(this._container),e._removeZoomLimit(this),this._container=null,this._tileZoom=void 0},bringToFront:function(){return this._map&&(Ot(this._container),this._setAutoZIndex(Math.max)),this},bringToBack:function(){return this._map&&(kt(this._container),this._setAutoZIndex(Math.min)),this},getContainer:function(){return this._container},setOpacity:function(e){return this.options.opacity=e,this._updateOpacity(),this},setZIndex:function(e){return this.options.zIndex=e,this._updateZIndex(),this},isLoading:function(){return this._loading},redraw:function(){if(this._map){this._removeAllTiles();var e=this._clampZoom(this._map.getZoom());e!==this._tileZoom&&(this._tileZoom=e,this._updateLevels()),this._update()}return this},getEvents:function(){var e={viewprereset:this._invalidateAll,viewreset:this._resetView,zoom:this._resetView,moveend:this._onMoveEnd};return this.options.updateWhenIdle||(this._onMove||=s(this._onMoveEnd,this.options.updateInterval,this),e.move=this._onMove),this._zoomAnimated&&(e.zoomanim=this._animateZoom),e},createTile:function(){return document.createElement(`div`)},getTileSize:function(){var e=this.options.tileSize;return e instanceof x?e:new x(e,e)},_updateZIndex:function(){this._container&&this.options.zIndex!==void 0&&this.options.zIndex!==null&&(this._container.style.zIndex=this.options.zIndex)},_setAutoZIndex:function(e){for(var t=this.getPane().children,n=-e(-1/0,1/0),r=0,i=t.length,a;r<i;r++)a=t[r].style.zIndex,t[r]!==this._container&&a&&(n=e(n,+a));isFinite(n)&&(this.options.zIndex=n+e(-1,1),this._updateZIndex())},_updateOpacity:function(){if(this._map&&!M.ielt9){z(this._container,this.options.opacity);var e=+new Date,t=!1,n=!1;for(var r in this._tiles){var i=this._tiles[r];if(!(!i.current||!i.loaded)){var a=Math.min(1,(e-i.loaded)/200);z(i.el,a),a<1?t=!0:(i.active?n=!0:this._onOpaqueTile(i),i.active=!0)}}n&&!this._noPrune&&this._pruneTiles(),t&&(v(this._fadeFrame),this._fadeFrame=_(this._updateOpacity,this))}},_onOpaqueTile:l,_initContainer:function(){this._container||(this._container=P(`div`,`leaflet-layer `+(this.options.className||``)),this._updateZIndex(),this.options.opacity<1&&this._updateOpacity(),this.getPane().appendChild(this._container))},_updateLevels:function(){var e=this._tileZoom,t=this.options.maxZoom;if(e!==void 0){for(var n in this._levels)n=Number(n),this._levels[n].el.children.length||n===e?(this._levels[n].el.style.zIndex=t-Math.abs(e-n),this._onUpdateLevel(n)):(F(this._levels[n].el),this._removeTilesAtZoom(n),this._onRemoveLevel(n),delete this._levels[n]);var r=this._levels[e],i=this._map;return r||(r=this._levels[e]={},r.el=P(`div`,`leaflet-tile-container leaflet-zoom-animated`,this._container),r.el.style.zIndex=t,r.origin=i.project(i.unproject(i.getPixelOrigin()),e).round(),r.zoom=e,this._setZoomTransform(r,i.getCenter(),i.getZoom()),r.el.offsetWidth,this._onCreateLevel(r)),this._level=r,r}},_onUpdateLevel:l,_onRemoveLevel:l,_onCreateLevel:l,_pruneTiles:function(){if(this._map){var e,t,n=this._map.getZoom();if(n>this.options.maxZoom||n<this.options.minZoom){this._removeAllTiles();return}for(e in this._tiles)t=this._tiles[e],t.retain=t.current;for(e in this._tiles)if(t=this._tiles[e],t.current&&!t.active){var r=t.coords;this._retainParent(r.x,r.y,r.z,r.z-5)||this._retainChildren(r.x,r.y,r.z,r.z+2)}for(e in this._tiles)this._tiles[e].retain||this._removeTile(e)}},_removeTilesAtZoom:function(e){for(var t in this._tiles)this._tiles[t].coords.z===e&&this._removeTile(t)},_removeAllTiles:function(){for(var e in this._tiles)this._removeTile(e)},_invalidateAll:function(){for(var e in this._levels)F(this._levels[e].el),this._onRemoveLevel(Number(e)),delete this._levels[e];this._removeAllTiles(),this._tileZoom=void 0},_retainParent:function(e,t,n,r){var i=Math.floor(e/2),a=Math.floor(t/2),o=n-1,s=new x(+i,+a);s.z=+o;var c=this._tileCoordsToKey(s),l=this._tiles[c];return l&&l.active?(l.retain=!0,!0):(l&&l.loaded&&(l.retain=!0),o>r?this._retainParent(i,a,o,r):!1)},_retainChildren:function(e,t,n,r){for(var i=2*e;i<2*e+2;i++)for(var a=2*t;a<2*t+2;a++){var o=new x(i,a);o.z=n+1;var s=this._tileCoordsToKey(o),c=this._tiles[s];if(c&&c.active){c.retain=!0;continue}else c&&c.loaded&&(c.retain=!0);n+1<r&&this._retainChildren(i,a,n+1,r)}},_resetView:function(e){var t=e&&(e.pinch||e.flyTo);this._setView(this._map.getCenter(),this._map.getZoom(),t,t)},_animateZoom:function(e){this._setView(e.center,e.zoom,!0,e.noUpdate)},_clampZoom:function(e){var t=this.options;return t.minNativeZoom!==void 0&&e<t.minNativeZoom?t.minNativeZoom:t.maxNativeZoom!==void 0&&t.maxNativeZoom<e?t.maxNativeZoom:e},_setView:function(e,t,n,r){var i=Math.round(t);i=this.options.maxZoom!==void 0&&i>this.options.maxZoom||this.options.minZoom!==void 0&&i<this.options.minZoom?void 0:this._clampZoom(i);var a=this.options.updateWhenZooming&&i!==this._tileZoom;(!r||a)&&(this._tileZoom=i,this._abortLoading&&this._abortLoading(),this._updateLevels(),this._resetGrid(),i!==void 0&&this._update(e),n||this._pruneTiles(),this._noPrune=!!n),this._setZoomTransforms(e,t)},_setZoomTransforms:function(e,t){for(var n in this._levels)this._setZoomTransform(this._levels[n],e,t)},_setZoomTransform:function(e,t,n){var r=this._map.getZoomScale(n,e.zoom),i=e.origin.multiplyBy(r).subtract(this._map._getNewPixelOrigin(t,n)).round();M.any3d?Ft(e.el,i,r):B(e.el,i)},_resetGrid:function(){var e=this._map,t=e.options.crs,n=this._tileSize=this.getTileSize(),r=this._tileZoom,i=this._map.getPixelWorldBounds(this._tileZoom);i&&(this._globalTileRange=this._pxBoundsToTileRange(i)),this._wrapX=t.wrapLng&&!this.options.noWrap&&[Math.floor(e.project([0,t.wrapLng[0]],r).x/n.x),Math.ceil(e.project([0,t.wrapLng[1]],r).x/n.y)],this._wrapY=t.wrapLat&&!this.options.noWrap&&[Math.floor(e.project([t.wrapLat[0],0],r).y/n.x),Math.ceil(e.project([t.wrapLat[1],0],r).y/n.y)]},_onMoveEnd:function(){!this._map||this._map._animatingZoom||this._update()},_getTiledPixelBounds:function(e){var t=this._map,n=t._animatingZoom?Math.max(t._animateToZoom,t.getZoom()):t.getZoom(),r=t.getZoomScale(n,this._tileZoom),i=t.project(e,this._tileZoom).floor(),a=t.getSize().divideBy(r*2);return new C(i.subtract(a),i.add(a))},_update:function(e){var t=this._map;if(t){var n=this._clampZoom(t.getZoom());if(e===void 0&&(e=t.getCenter()),this._tileZoom!==void 0){var r=this._getTiledPixelBounds(e),i=this._pxBoundsToTileRange(r),a=i.getCenter(),o=[],s=this.options.keepBuffer,c=new C(i.getBottomLeft().subtract([s,-s]),i.getTopRight().add([s,-s]));if(!(isFinite(i.min.x)&&isFinite(i.min.y)&&isFinite(i.max.x)&&isFinite(i.max.y)))throw Error(`Attempted to load an infinite number of tiles`);for(var l in this._tiles){var u=this._tiles[l].coords;(u.z!==this._tileZoom||!c.contains(new x(u.x,u.y)))&&(this._tiles[l].current=!1)}if(Math.abs(n-this._tileZoom)>1){this._setView(e,n);return}for(var d=i.min.y;d<=i.max.y;d++)for(var f=i.min.x;f<=i.max.x;f++){var p=new x(f,d);if(p.z=this._tileZoom,this._isValidTile(p)){var m=this._tiles[this._tileCoordsToKey(p)];m?m.current=!0:o.push(p)}}if(o.sort(function(e,t){return e.distanceTo(a)-t.distanceTo(a)}),o.length!==0){this._loading||(this._loading=!0,this.fire(`loading`));var ee=document.createDocumentFragment();for(f=0;f<o.length;f++)this._addTile(o[f],ee);this._level.el.appendChild(ee)}}}},_isValidTile:function(e){var t=this._map.options.crs;if(!t.infinite){var n=this._globalTileRange;if(!t.wrapLng&&(e.x<n.min.x||e.x>n.max.x)||!t.wrapLat&&(e.y<n.min.y||e.y>n.max.y))return!1}if(!this.options.bounds)return!0;var r=this._tileCoordsToBounds(e);return E(this.options.bounds).overlaps(r)},_keyToBounds:function(e){return this._tileCoordsToBounds(this._keyToTileCoords(e))},_tileCoordsToNwSe:function(e){var t=this._map,n=this.getTileSize(),r=e.scaleBy(n),i=r.add(n);return[t.unproject(r,e.z),t.unproject(i,e.z)]},_tileCoordsToBounds:function(e){var t=this._tileCoordsToNwSe(e),n=new T(t[0],t[1]);return this.options.noWrap||(n=this._map.wrapLatLngBounds(n)),n},_tileCoordsToKey:function(e){return e.x+`:`+e.y+`:`+e.z},_keyToTileCoords:function(e){var t=e.split(`:`),n=new x(+t[0],+t[1]);return n.z=+t[2],n},_removeTile:function(e){var t=this._tiles[e];t&&(F(t.el),delete this._tiles[e],this.fire(`tileunload`,{tile:t.el,coords:this._keyToTileCoords(e)}))},_initTile:function(e){I(e,`leaflet-tile`);var t=this.getTileSize();e.style.width=t.x+`px`,e.style.height=t.y+`px`,e.onselectstart=l,e.onmousemove=l,M.ielt9&&this.options.opacity<1&&z(e,this.options.opacity)},_addTile:function(e,t){var n=this._getTilePos(e),r=this._tileCoordsToKey(e),a=this.createTile(this._wrapCoords(e),i(this._tileReady,this,e));this._initTile(a),this.createTile.length<2&&_(i(this._tileReady,this,e,null,a)),B(a,n),this._tiles[r]={el:a,coords:e,current:!0},t.appendChild(a),this.fire(`tileloadstart`,{tile:a,coords:e})},_tileReady:function(e,t,n){t&&this.fire(`tileerror`,{error:t,tile:n,coords:e});var r=this._tileCoordsToKey(e);n=this._tiles[r],n&&(n.loaded=+new Date,this._map._fadeAnimated?(z(n.el,0),v(this._fadeFrame),this._fadeFrame=_(this._updateOpacity,this)):(n.active=!0,this._pruneTiles()),t||(I(n.el,`leaflet-tile-loaded`),this.fire(`tileload`,{tile:n.el,coords:e})),this._noTilesToLoad()&&(this._loading=!1,this.fire(`load`),M.ielt9||!this._map._fadeAnimated?_(this._pruneTiles,this):setTimeout(i(this._pruneTiles,this),250)))},_getTilePos:function(e){return e.scaleBy(this.getTileSize()).subtract(this._level.origin)},_wrapCoords:function(e){var t=new x(this._wrapX?c(e.x,this._wrapX):e.x,this._wrapY?c(e.y,this._wrapY):e.y);return t.z=e.z,t},_pxBoundsToTileRange:function(e){var t=this.getTileSize();return new C(e.min.unscaleBy(t).floor(),e.max.unscaleBy(t).ceil().subtract([1,1]))},_noTilesToLoad:function(){for(var e in this._tiles)if(!this._tiles[e].loaded)return!1;return!0}});function Ir(e){return new Fr(e)}var Lr=Fr.extend({options:{minZoom:0,maxZoom:18,subdomains:`abc`,errorTileUrl:``,zoomOffset:0,tms:!1,zoomReverse:!1,detectRetina:!1,crossOrigin:!1,referrerPolicy:!1},initialize:function(e,t){this._url=e,t=p(this,t),t.detectRetina&&M.retina&&t.maxZoom>0?(t.tileSize=Math.floor(t.tileSize/2),t.zoomReverse?(t.zoomOffset--,t.minZoom=Math.min(t.maxZoom,t.minZoom+1)):(t.zoomOffset++,t.maxZoom=Math.max(t.minZoom,t.maxZoom-1)),t.minZoom=Math.max(0,t.minZoom)):t.zoomReverse?t.minZoom=Math.min(t.maxZoom,t.minZoom):t.maxZoom=Math.max(t.minZoom,t.maxZoom),typeof t.subdomains==`string`&&(t.subdomains=t.subdomains.split(``)),this.on(`tileunload`,this._onTileRemove)},setUrl:function(e,t){return this._url===e&&t===void 0&&(t=!0),this._url=e,t||this.redraw(),this},createTile:function(e,t){var n=document.createElement(`img`);return H(n,`load`,i(this._tileOnLoad,this,t,n)),H(n,`error`,i(this._tileOnError,this,t,n)),(this.options.crossOrigin||this.options.crossOrigin===``)&&(n.crossOrigin=this.options.crossOrigin===!0?``:this.options.crossOrigin),typeof this.options.referrerPolicy==`string`&&(n.referrerPolicy=this.options.referrerPolicy),n.alt=``,n.src=this.getTileUrl(e),n},getTileUrl:function(e){var t={r:M.retina?`@2x`:``,s:this._getSubdomain(e),x:e.x,y:e.y,z:this._getZoomForUrl()};if(this._map&&!this._map.options.crs.infinite){var r=this._globalTileRange.max.y-e.y;this.options.tms&&(t.y=r),t[`-y`]=r}return h(this._url,n(t,this.options))},_tileOnLoad:function(e,t){M.ielt9?setTimeout(i(e,this,null,t),0):e(null,t)},_tileOnError:function(e,t,n){var r=this.options.errorTileUrl;r&&t.getAttribute(`src`)!==r&&(t.src=r),e(n,t)},_onTileRemove:function(e){e.tile.onload=null},_getZoomForUrl:function(){var e=this._tileZoom,t=this.options.maxZoom,n=this.options.zoomReverse,r=this.options.zoomOffset;return n&&(e=t-e),e+r},_getSubdomain:function(e){var t=Math.abs(e.x+e.y)%this.options.subdomains.length;return this.options.subdomains[t]},_abortLoading:function(){var e,t;for(e in this._tiles)if(this._tiles[e].coords.z!==this._tileZoom&&(t=this._tiles[e].el,t.onload=l,t.onerror=l,!t.complete)){t.src=ne;var n=this._tiles[e].coords;F(t),delete this._tiles[e],this.fire(`tileabort`,{tile:t,coords:n})}},_removeTile:function(e){var t=this._tiles[e];if(t)return t.el.setAttribute(`src`,ne),Fr.prototype._removeTile.call(this,e)},_tileReady:function(e,t,n){if(!(!this._map||n&&n.getAttribute(`src`)===ne))return Fr.prototype._tileReady.call(this,e,t,n)}});function Rr(e,t){return new Lr(e,t)}var zr=Lr.extend({defaultWmsParams:{service:`WMS`,request:`GetMap`,layers:``,styles:``,format:`image/jpeg`,transparent:!1,version:`1.1.1`},options:{crs:null,uppercase:!1},initialize:function(e,t){this._url=e;var r=n({},this.defaultWmsParams);for(var i in t)i in this.options||(r[i]=t[i]);t=p(this,t);var a=t.detectRetina&&M.retina?2:1,o=this.getTileSize();r.width=o.x*a,r.height=o.y*a,this.wmsParams=r},onAdd:function(e){this._crs=this.options.crs||e.options.crs,this._wmsVersion=parseFloat(this.wmsParams.version);var t=this._wmsVersion>=1.3?`crs`:`srs`;this.wmsParams[t]=this._crs.code,Lr.prototype.onAdd.call(this,e)},getTileUrl:function(e){var t=this._tileCoordsToNwSe(e),n=this._crs,r=w(n.project(t[0]),n.project(t[1])),i=r.min,a=r.max,o=(this._wmsVersion>=1.3&&this._crs===Kn?[i.y,i.x,a.y,a.x]:[i.x,i.y,a.x,a.y]).join(`,`),s=Lr.prototype.getTileUrl.call(this,e);return s+m(this.wmsParams,s,this.options.uppercase)+(this.options.uppercase?`&BBOX=`:`&bbox=`)+o},setParams:function(e,t){return n(this.wmsParams,e),t||this.redraw(),this}});function Br(e,t){return new zr(e,t)}Lr.WMS=zr,Rr.wms=Br;var Vr=X.extend({options:{padding:.1},initialize:function(e){p(this,e),o(this),this._layers=this._layers||{}},onAdd:function(){this._container||(this._initContainer(),I(this._container,`leaflet-zoom-animated`)),this.getPane().appendChild(this._container),this._update(),this.on(`update`,this._updatePaths,this)},onRemove:function(){this.off(`update`,this._updatePaths,this),this._destroyContainer()},getEvents:function(){var e={viewreset:this._reset,zoom:this._onZoom,moveend:this._update,zoomend:this._onZoomEnd};return this._zoomAnimated&&(e.zoomanim=this._onAnimZoom),e},_onAnimZoom:function(e){this._updateTransform(e.center,e.zoom)},_onZoom:function(){this._updateTransform(this._map.getCenter(),this._map.getZoom())},_updateTransform:function(e,t){var n=this._map.getZoomScale(t,this._zoom),r=this._map.getSize().multiplyBy(.5+this.options.padding),i=this._map.project(this._center,t),a=r.multiplyBy(-n).add(i).subtract(this._map._getNewPixelOrigin(e,t));M.any3d?Ft(this._container,a,n):B(this._container,a)},_reset:function(){for(var e in this._update(),this._updateTransform(this._center,this._zoom),this._layers)this._layers[e]._reset()},_onZoomEnd:function(){for(var e in this._layers)this._layers[e]._project()},_updatePaths:function(){for(var e in this._layers)this._layers[e]._update()},_update:function(){var e=this.options.padding,t=this._map.getSize(),n=this._map.containerPointToLayerPoint(t.multiplyBy(-e)).round();this._bounds=new C(n,n.add(t.multiplyBy(1+e*2)).round()),this._center=this._map.getCenter(),this._zoom=this._map.getZoom()}}),Hr=Vr.extend({options:{tolerance:0},getEvents:function(){var e=Vr.prototype.getEvents.call(this);return e.viewprereset=this._onViewPreReset,e},_onViewPreReset:function(){this._postponeUpdatePaths=!0},onAdd:function(){Vr.prototype.onAdd.call(this),this._draw()},_initContainer:function(){var e=this._container=document.createElement(`canvas`);H(e,`mousemove`,this._onMouseMove,this),H(e,`click dblclick mousedown mouseup contextmenu`,this._onClick,this),H(e,`mouseout`,this._handleMouseOut,this),e._leaflet_disable_events=!0,this._ctx=e.getContext(`2d`)},_destroyContainer:function(){v(this._redrawRequest),delete this._ctx,F(this._container),W(this._container),delete this._container},_updatePaths:function(){if(!this._postponeUpdatePaths){var e;for(var t in this._redrawBounds=null,this._layers)e=this._layers[t],e._update();this._redraw()}},_update:function(){if(!(this._map._animatingZoom&&this._bounds)){Vr.prototype._update.call(this);var e=this._bounds,t=this._container,n=e.getSize(),r=M.retina?2:1;B(t,e.min),t.width=r*n.x,t.height=r*n.y,t.style.width=n.x+`px`,t.style.height=n.y+`px`,M.retina&&this._ctx.scale(2,2),this._ctx.translate(-e.min.x,-e.min.y),this.fire(`update`)}},_reset:function(){Vr.prototype._reset.call(this),this._postponeUpdatePaths&&(this._postponeUpdatePaths=!1,this._updatePaths())},_initPath:function(e){this._updateDashArray(e),this._layers[o(e)]=e;var t=e._order={layer:e,prev:this._drawLast,next:null};this._drawLast&&(this._drawLast.next=t),this._drawLast=t,this._drawFirst=this._drawFirst||this._drawLast},_addPath:function(e){this._requestRedraw(e)},_removePath:function(e){var t=e._order,n=t.next,r=t.prev;n?n.prev=r:this._drawLast=r,r?r.next=n:this._drawFirst=n,delete e._order,delete this._layers[o(e)],this._requestRedraw(e)},_updatePath:function(e){this._extendRedrawBounds(e),e._project(),e._update(),this._requestRedraw(e)},_updateStyle:function(e){this._updateDashArray(e),this._requestRedraw(e)},_updateDashArray:function(e){if(typeof e.options.dashArray==`string`){var t=e.options.dashArray.split(/[, ]+/),n=[],r,i;for(i=0;i<t.length;i++){if(r=Number(t[i]),isNaN(r))return;n.push(r)}e.options._dashArray=n}else e.options._dashArray=e.options.dashArray},_requestRedraw:function(e){this._map&&(this._extendRedrawBounds(e),this._redrawRequest=this._redrawRequest||_(this._redraw,this))},_extendRedrawBounds:function(e){if(e._pxBounds){var t=(e.options.weight||0)+1;this._redrawBounds=this._redrawBounds||new C,this._redrawBounds.extend(e._pxBounds.min.subtract([t,t])),this._redrawBounds.extend(e._pxBounds.max.add([t,t]))}},_redraw:function(){this._redrawRequest=null,this._redrawBounds&&(this._redrawBounds.min._floor(),this._redrawBounds.max._ceil()),this._clear(),this._draw(),this._redrawBounds=null},_clear:function(){var e=this._redrawBounds;if(e){var t=e.getSize();this._ctx.clearRect(e.min.x,e.min.y,t.x,t.y)}else this._ctx.save(),this._ctx.setTransform(1,0,0,1,0,0),this._ctx.clearRect(0,0,this._container.width,this._container.height),this._ctx.restore()},_draw:function(){var e,t=this._redrawBounds;if(this._ctx.save(),t){var n=t.getSize();this._ctx.beginPath(),this._ctx.rect(t.min.x,t.min.y,n.x,n.y),this._ctx.clip()}this._drawing=!0;for(var r=this._drawFirst;r;r=r.next)e=r.layer,(!t||e._pxBounds&&e._pxBounds.intersects(t))&&e._updatePath();this._drawing=!1,this._ctx.restore()},_updatePoly:function(e,t){if(this._drawing){var n,r,i,a,o=e._parts,s=o.length,c=this._ctx;if(s){for(c.beginPath(),n=0;n<s;n++){for(r=0,i=o[n].length;r<i;r++)a=o[n][r],c[r?`lineTo`:`moveTo`](a.x,a.y);t&&c.closePath()}this._fillStroke(c,e)}}},_updateCircle:function(e){if(!(!this._drawing||e._empty())){var t=e._point,n=this._ctx,r=Math.max(Math.round(e._radius),1),i=(Math.max(Math.round(e._radiusY),1)||r)/r;i!==1&&(n.save(),n.scale(1,i)),n.beginPath(),n.arc(t.x,t.y/i,r,0,Math.PI*2,!1),i!==1&&n.restore(),this._fillStroke(n,e)}},_fillStroke:function(e,t){var n=t.options;n.fill&&(e.globalAlpha=n.fillOpacity,e.fillStyle=n.fillColor||n.color,e.fill(n.fillRule||`evenodd`)),n.stroke&&n.weight!==0&&(e.setLineDash&&e.setLineDash(t.options&&t.options._dashArray||[]),e.globalAlpha=n.opacity,e.lineWidth=n.weight,e.strokeStyle=n.color,e.lineCap=n.lineCap,e.lineJoin=n.lineJoin,e.stroke())},_onClick:function(e){for(var t=this._map.mouseEventToLayerPoint(e),n,r,i=this._drawFirst;i;i=i.next)n=i.layer,n.options.interactive&&n._containsPoint(t)&&(!(e.type===`click`||e.type===`preclick`)||!this._map._draggableMoved(n))&&(r=n);this._fireEvent(r?[r]:!1,e)},_onMouseMove:function(e){if(!(!this._map||this._map.dragging.moving()||this._map._animatingZoom)){var t=this._map.mouseEventToLayerPoint(e);this._handleMouseHover(e,t)}},_handleMouseOut:function(e){var t=this._hoveredLayer;t&&(R(this._container,`leaflet-interactive`),this._fireEvent([t],e,`mouseout`),this._hoveredLayer=null,this._mouseHoverThrottled=!1)},_handleMouseHover:function(e,t){if(!this._mouseHoverThrottled){for(var n,r,a=this._drawFirst;a;a=a.next)n=a.layer,n.options.interactive&&n._containsPoint(t)&&(r=n);r!==this._hoveredLayer&&(this._handleMouseOut(e),r&&(I(this._container,`leaflet-interactive`),this._fireEvent([r],e,`mouseover`),this._hoveredLayer=r)),this._fireEvent(this._hoveredLayer?[this._hoveredLayer]:!1,e),this._mouseHoverThrottled=!0,setTimeout(i(function(){this._mouseHoverThrottled=!1},this),32)}},_fireEvent:function(e,t,n){this._map._fireDOMEvent(t,n||t.type,e)},_bringToFront:function(e){var t=e._order;if(t){var n=t.next,r=t.prev;if(n)n.prev=r;else return;r?r.next=n:n&&(this._drawFirst=n),t.prev=this._drawLast,this._drawLast.next=t,t.next=null,this._drawLast=t,this._requestRedraw(e)}},_bringToBack:function(e){var t=e._order;if(t){var n=t.next,r=t.prev;if(r)r.next=n;else return;n?n.prev=r:r&&(this._drawLast=r),t.prev=null,t.next=this._drawFirst,this._drawFirst.prev=t,this._drawFirst=t,this._requestRedraw(e)}}});function Ur(e){return M.canvas?new Hr(e):null}var Wr=(function(){try{return document.namespaces.add(`lvml`,`urn:schemas-microsoft-com:vml`),function(e){return document.createElement(`<lvml:`+e+` class="lvml">`)}}catch{}return function(e){return document.createElement(`<`+e+` xmlns="urn:schemas-microsoft.com:vml" class="lvml">`)}})(),Gr={_initContainer:function(){this._container=P(`div`,`leaflet-vml-container`)},_update:function(){this._map._animatingZoom||(Vr.prototype._update.call(this),this.fire(`update`))},_initPath:function(e){var t=e._container=Wr(`shape`);I(t,`leaflet-vml-shape `+(this.options.className||``)),t.coordsize=`1 1`,e._path=Wr(`path`),t.appendChild(e._path),this._updateStyle(e),this._layers[o(e)]=e},_addPath:function(e){var t=e._container;this._container.appendChild(t),e.options.interactive&&e.addInteractiveTarget(t)},_removePath:function(e){var t=e._container;F(t),e.removeInteractiveTarget(t),delete this._layers[o(e)]},_updateStyle:function(e){var t=e._stroke,n=e._fill,r=e.options,i=e._container;i.stroked=!!r.stroke,i.filled=!!r.fill,r.stroke?(t||=e._stroke=Wr(`stroke`),i.appendChild(t),t.weight=r.weight+`px`,t.color=r.color,t.opacity=r.opacity,r.dashArray?t.dashStyle=g(r.dashArray)?r.dashArray.join(` `):r.dashArray.replace(/( *, *)/g,` `):t.dashStyle=``,t.endcap=r.lineCap.replace(`butt`,`flat`),t.joinstyle=r.lineJoin):t&&(i.removeChild(t),e._stroke=null),r.fill?(n||=e._fill=Wr(`fill`),i.appendChild(n),n.color=r.fillColor||r.color,n.opacity=r.fillOpacity):n&&(i.removeChild(n),e._fill=null)},_updateCircle:function(e){var t=e._point.round(),n=Math.round(e._radius),r=Math.round(e._radiusY||n);this._setPath(e,e._empty()?`M0 0`:`AL `+t.x+`,`+t.y+` `+n+`,`+r+` 0,23592600`)},_setPath:function(e,t){e._path.v=t},_bringToFront:function(e){Ot(e._container)},_bringToBack:function(e){kt(e._container)}},Kr=M.vml?Wr:k,qr=Vr.extend({_initContainer:function(){this._container=Kr(`svg`),this._container.setAttribute(`pointer-events`,`none`),this._rootGroup=Kr(`g`),this._container.appendChild(this._rootGroup)},_destroyContainer:function(){F(this._container),W(this._container),delete this._container,delete this._rootGroup,delete this._svgSize},_update:function(){if(!(this._map._animatingZoom&&this._bounds)){Vr.prototype._update.call(this);var e=this._bounds,t=e.getSize(),n=this._container;(!this._svgSize||!this._svgSize.equals(t))&&(this._svgSize=t,n.setAttribute(`width`,t.x),n.setAttribute(`height`,t.y)),B(n,e.min),n.setAttribute(`viewBox`,[e.min.x,e.min.y,t.x,t.y].join(` `)),this.fire(`update`)}},_initPath:function(e){var t=e._path=Kr(`path`);e.options.className&&I(t,e.options.className),e.options.interactive&&I(t,`leaflet-interactive`),this._updateStyle(e),this._layers[o(e)]=e},_addPath:function(e){this._rootGroup||this._initContainer(),this._rootGroup.appendChild(e._path),e.addInteractiveTarget(e._path)},_removePath:function(e){F(e._path),e.removeInteractiveTarget(e._path),delete this._layers[o(e)]},_updatePath:function(e){e._project(),e._update()},_updateStyle:function(e){var t=e._path,n=e.options;t&&(n.stroke?(t.setAttribute(`stroke`,n.color),t.setAttribute(`stroke-opacity`,n.opacity),t.setAttribute(`stroke-width`,n.weight),t.setAttribute(`stroke-linecap`,n.lineCap),t.setAttribute(`stroke-linejoin`,n.lineJoin),n.dashArray?t.setAttribute(`stroke-dasharray`,n.dashArray):t.removeAttribute(`stroke-dasharray`),n.dashOffset?t.setAttribute(`stroke-dashoffset`,n.dashOffset):t.removeAttribute(`stroke-dashoffset`)):t.setAttribute(`stroke`,`none`),n.fill?(t.setAttribute(`fill`,n.fillColor||n.color),t.setAttribute(`fill-opacity`,n.fillOpacity),t.setAttribute(`fill-rule`,n.fillRule||`evenodd`)):t.setAttribute(`fill`,`none`))},_updatePoly:function(e,t){this._setPath(e,be(e._parts,t))},_updateCircle:function(e){var t=e._point,n=Math.max(Math.round(e._radius),1),r=Math.max(Math.round(e._radiusY),1)||n,i=`a`+n+`,`+r+` 0 1,0 `,a=e._empty()?`M0 0`:`M`+(t.x-n)+`,`+t.y+i+n*2+`,0 `+i+-n*2+`,0 `;this._setPath(e,a)},_setPath:function(e,t){e._path.setAttribute(`d`,t)},_bringToFront:function(e){Ot(e._path)},_bringToBack:function(e){kt(e._path)}});M.vml&&qr.include(Gr);function Jr(e){return M.svg||M.vml?new qr(e):null}K.include({getRenderer:function(e){var t=e.options.renderer||this._getPaneRenderer(e.options.pane)||this.options.renderer||this._renderer;return t||=this._renderer=this._createRenderer(),this.hasLayer(t)||this.addLayer(t),t},_getPaneRenderer:function(e){if(e===`overlayPane`||e===void 0)return!1;var t=this._paneRenderers[e];return t===void 0&&(t=this._createRenderer({pane:e}),this._paneRenderers[e]=t),t},_createRenderer:function(e){return this.options.preferCanvas&&Ur(e)||Jr(e)}});var Yr=cr.extend({initialize:function(e,t){cr.prototype.initialize.call(this,this._boundsToLatLngs(e),t)},setBounds:function(e){return this.setLatLngs(this._boundsToLatLngs(e))},_boundsToLatLngs:function(e){return e=E(e),[e.getSouthWest(),e.getNorthWest(),e.getNorthEast(),e.getSouthEast()]}});function Xr(e,t){return new Yr(e,t)}qr.create=Kr,qr.pointsToPath=be,ur.geometryToLayer=dr,ur.coordsToLatLng=pr,ur.coordsToLatLngs=mr,ur.latLngToCoords=hr,ur.latLngsToCoords=gr,ur.getFeature=_r,ur.asFeature=vr,K.mergeOptions({boxZoom:!0});var Zr=bn.extend({initialize:function(e){this._map=e,this._container=e._container,this._pane=e._panes.overlayPane,this._resetStateTimeout=0,e.on(`unload`,this._destroy,this)},addHooks:function(){H(this._container,`mousedown`,this._onMouseDown,this)},removeHooks:function(){W(this._container,`mousedown`,this._onMouseDown,this)},moved:function(){return this._moved},_destroy:function(){F(this._pane),delete this._pane},_resetState:function(){this._resetStateTimeout=0,this._moved=!1},_clearDeferredResetState:function(){this._resetStateTimeout!==0&&(clearTimeout(this._resetStateTimeout),this._resetStateTimeout=0)},_onMouseDown:function(e){if(!e.shiftKey||e.which!==1&&e.button!==1)return!1;this._clearDeferredResetState(),this._resetState(),Lt(),Vt(),this._startPoint=this._map.mouseEventToContainerPoint(e),H(document,{contextmenu:nn,mousemove:this._onMouseMove,mouseup:this._onMouseUp,keydown:this._onKeyDown},this)},_onMouseMove:function(e){this._moved||(this._moved=!0,this._box=P(`div`,`leaflet-zoom-box`,this._container),I(this._container,`leaflet-crosshair`),this._map.fire(`boxzoomstart`)),this._point=this._map.mouseEventToContainerPoint(e);var t=new C(this._point,this._startPoint),n=t.getSize();B(this._box,t.min),this._box.style.width=n.x+`px`,this._box.style.height=n.y+`px`},_finish:function(){this._moved&&(F(this._box),R(this._container,`leaflet-crosshair`)),Rt(),Ht(),W(document,{contextmenu:nn,mousemove:this._onMouseMove,mouseup:this._onMouseUp,keydown:this._onKeyDown},this)},_onMouseUp:function(e){if(!(e.which!==1&&e.button!==1)&&(this._finish(),this._moved)){this._clearDeferredResetState(),this._resetStateTimeout=setTimeout(i(this._resetState,this),0);var t=new T(this._map.containerPointToLatLng(this._startPoint),this._map.containerPointToLatLng(this._point));this._map.fitBounds(t).fire(`boxzoomend`,{boxZoomBounds:t})}},_onKeyDown:function(e){e.keyCode===27&&(this._finish(),this._clearDeferredResetState(),this._resetState())}});K.addInitHook(`addHandler`,`boxZoom`,Zr),K.mergeOptions({doubleClickZoom:!0});var Qr=bn.extend({addHooks:function(){this._map.on(`dblclick`,this._onDoubleClick,this)},removeHooks:function(){this._map.off(`dblclick`,this._onDoubleClick,this)},_onDoubleClick:function(e){var t=this._map,n=t.getZoom(),r=t.options.zoomDelta,i=e.originalEvent.shiftKey?n-r:n+r;t.options.doubleClickZoom===`center`?t.setZoom(i):t.setZoomAround(e.containerPoint,i)}});K.addInitHook(`addHandler`,`doubleClickZoom`,Qr),K.mergeOptions({dragging:!0,inertia:!0,inertiaDeceleration:3400,inertiaMaxSpeed:1/0,easeLinearity:.2,worldCopyJump:!1,maxBoundsViscosity:0});var $r=bn.extend({addHooks:function(){if(!this._draggable){var e=this._map;this._draggable=new Sn(e._mapPane,e._container),this._draggable.on({dragstart:this._onDragStart,drag:this._onDrag,dragend:this._onDragEnd},this),this._draggable.on(`predrag`,this._onPreDragLimit,this),e.options.worldCopyJump&&(this._draggable.on(`predrag`,this._onPreDragWrap,this),e.on(`zoomend`,this._onZoomEnd,this),e.whenReady(this._onZoomEnd,this))}I(this._map._container,`leaflet-grab leaflet-touch-drag`),this._draggable.enable(),this._positions=[],this._times=[]},removeHooks:function(){R(this._map._container,`leaflet-grab`),R(this._map._container,`leaflet-touch-drag`),this._draggable.disable()},moved:function(){return this._draggable&&this._draggable._moved},moving:function(){return this._draggable&&this._draggable._moving},_onDragStart:function(){var e=this._map;if(e._stop(),this._map.options.maxBounds&&this._map.options.maxBoundsViscosity){var t=E(this._map.options.maxBounds);this._offsetLimit=w(this._map.latLngToContainerPoint(t.getNorthWest()).multiplyBy(-1),this._map.latLngToContainerPoint(t.getSouthEast()).multiplyBy(-1).add(this._map.getSize())),this._viscosity=Math.min(1,Math.max(0,this._map.options.maxBoundsViscosity))}else this._offsetLimit=null;e.fire(`movestart`).fire(`dragstart`),e.options.inertia&&(this._positions=[],this._times=[])},_onDrag:function(e){if(this._map.options.inertia){var t=this._lastTime=+new Date,n=this._lastPos=this._draggable._absPos||this._draggable._newPos;this._positions.push(n),this._times.push(t),this._prunePositions(t)}this._map.fire(`move`,e).fire(`drag`,e)},_prunePositions:function(e){for(;this._positions.length>1&&e-this._times[0]>50;)this._positions.shift(),this._times.shift()},_onZoomEnd:function(){var e=this._map.getSize().divideBy(2),t=this._map.latLngToLayerPoint([0,0]);this._initialWorldOffset=t.subtract(e).x,this._worldWidth=this._map.getPixelWorldBounds().getSize().x},_viscousLimit:function(e,t){return e-(e-t)*this._viscosity},_onPreDragLimit:function(){if(!(!this._viscosity||!this._offsetLimit)){var e=this._draggable._newPos.subtract(this._draggable._startPos),t=this._offsetLimit;e.x<t.min.x&&(e.x=this._viscousLimit(e.x,t.min.x)),e.y<t.min.y&&(e.y=this._viscousLimit(e.y,t.min.y)),e.x>t.max.x&&(e.x=this._viscousLimit(e.x,t.max.x)),e.y>t.max.y&&(e.y=this._viscousLimit(e.y,t.max.y)),this._draggable._newPos=this._draggable._startPos.add(e)}},_onPreDragWrap:function(){var e=this._worldWidth,t=Math.round(e/2),n=this._initialWorldOffset,r=this._draggable._newPos.x,i=(r-t+n)%e+t-n,a=(r+t+n)%e-t-n,o=Math.abs(i+n)<Math.abs(a+n)?i:a;this._draggable._absPos=this._draggable._newPos.clone(),this._draggable._newPos.x=o},_onDragEnd:function(e){var t=this._map,n=t.options,r=!n.inertia||e.noInertia||this._times.length<2;if(t.fire(`dragend`,e),r)t.fire(`moveend`);else{this._prunePositions(+new Date);var i=this._lastPos.subtract(this._positions[0]),a=(this._lastTime-this._times[0])/1e3,o=n.easeLinearity,s=i.multiplyBy(o/a),c=s.distanceTo([0,0]),l=Math.min(n.inertiaMaxSpeed,c),u=s.multiplyBy(l/c),d=l/(n.inertiaDeceleration*o),f=u.multiplyBy(-d/2).round();!f.x&&!f.y?t.fire(`moveend`):(f=t._limitOffset(f,t.options.maxBounds),_(function(){t.panBy(f,{duration:d,easeLinearity:o,noMoveStart:!0,animate:!0})}))}}});K.addInitHook(`addHandler`,`dragging`,$r),K.mergeOptions({keyboard:!0,keyboardPanDelta:80});var ei=bn.extend({keyCodes:{left:[37],right:[39],down:[40],up:[38],zoomIn:[187,107,61,171],zoomOut:[189,109,54,173]},initialize:function(e){this._map=e,this._setPanDelta(e.options.keyboardPanDelta),this._setZoomDelta(e.options.zoomDelta)},addHooks:function(){var e=this._map._container;e.tabIndex<=0&&(e.tabIndex=`0`),H(e,{focus:this._onFocus,blur:this._onBlur,mousedown:this._onMouseDown},this),this._map.on({focus:this._addHooks,blur:this._removeHooks},this)},removeHooks:function(){this._removeHooks(),W(this._map._container,{focus:this._onFocus,blur:this._onBlur,mousedown:this._onMouseDown},this),this._map.off({focus:this._addHooks,blur:this._removeHooks},this)},_onMouseDown:function(){if(!this._focused){var e=document.body,t=document.documentElement,n=e.scrollTop||t.scrollTop,r=e.scrollLeft||t.scrollLeft;this._map._container.focus(),window.scrollTo(r,n)}},_onFocus:function(){this._focused=!0,this._map.fire(`focus`)},_onBlur:function(){this._focused=!1,this._map.fire(`blur`)},_setPanDelta:function(e){var t=this._panKeys={},n=this.keyCodes,r,i;for(r=0,i=n.left.length;r<i;r++)t[n.left[r]]=[-1*e,0];for(r=0,i=n.right.length;r<i;r++)t[n.right[r]]=[e,0];for(r=0,i=n.down.length;r<i;r++)t[n.down[r]]=[0,e];for(r=0,i=n.up.length;r<i;r++)t[n.up[r]]=[0,-1*e]},_setZoomDelta:function(e){var t=this._zoomKeys={},n=this.keyCodes,r,i;for(r=0,i=n.zoomIn.length;r<i;r++)t[n.zoomIn[r]]=e;for(r=0,i=n.zoomOut.length;r<i;r++)t[n.zoomOut[r]]=-e},_addHooks:function(){H(document,`keydown`,this._onKeyDown,this)},_removeHooks:function(){W(document,`keydown`,this._onKeyDown,this)},_onKeyDown:function(e){if(!(e.altKey||e.ctrlKey||e.metaKey)){var t=e.keyCode,n=this._map,r;if(t in this._panKeys){if(!n._panAnim||!n._panAnim._inProgress)if(r=this._panKeys[t],e.shiftKey&&(r=S(r).multiplyBy(3)),n.options.maxBounds&&(r=n._limitOffset(S(r),n.options.maxBounds)),n.options.worldCopyJump){var i=n.wrapLatLng(n.unproject(n.project(n.getCenter()).add(r)));n.panTo(i)}else n.panBy(r)}else if(t in this._zoomKeys)n.setZoom(n.getZoom()+(e.shiftKey?3:1)*this._zoomKeys[t]);else if(t===27&&n._popup&&n._popup.options.closeOnEscapeKey)n.closePopup();else return;nn(e)}}});K.addInitHook(`addHandler`,`keyboard`,ei),K.mergeOptions({scrollWheelZoom:!0,wheelDebounceTime:40,wheelPxPerZoomLevel:60});var ti=bn.extend({addHooks:function(){H(this._map._container,`wheel`,this._onWheelScroll,this),this._delta=0},removeHooks:function(){W(this._map._container,`wheel`,this._onWheelScroll,this)},_onWheelScroll:function(e){var t=sn(e),n=this._map.options.wheelDebounceTime;this._delta+=t,this._lastMousePos=this._map.mouseEventToContainerPoint(e),this._startTime||=+new Date;var r=Math.max(n-(+new Date-this._startTime),0);clearTimeout(this._timer),this._timer=setTimeout(i(this._performZoom,this),r),nn(e)},_performZoom:function(){var e=this._map,t=e.getZoom(),n=this._map.options.zoomSnap||0;e._stop();var r=this._delta/(this._map.options.wheelPxPerZoomLevel*4),i=4*Math.log(2/(1+Math.exp(-Math.abs(r))))/Math.LN2,a=n?Math.ceil(i/n)*n:i,o=e._limitZoom(t+(this._delta>0?a:-a))-t;this._delta=0,this._startTime=null,o&&(e.options.scrollWheelZoom===`center`?e.setZoom(t+o):e.setZoomAround(this._lastMousePos,t+o))}});K.addInitHook(`addHandler`,`scrollWheelZoom`,ti);var ni=600;K.mergeOptions({tapHold:M.touchNative&&M.safari&&M.mobile,tapTolerance:15});var ri=bn.extend({addHooks:function(){H(this._map._container,`touchstart`,this._onDown,this)},removeHooks:function(){W(this._map._container,`touchstart`,this._onDown,this)},_onDown:function(e){if(clearTimeout(this._holdTimeout),e.touches.length===1){var t=e.touches[0];this._startPos=this._newPos=new x(t.clientX,t.clientY),this._holdTimeout=setTimeout(i(function(){this._cancel(),this._isTapValid()&&(H(document,`touchend`,G),H(document,`touchend touchcancel`,this._cancelClickPrevent),this._simulateEvent(`contextmenu`,t))},this),ni),H(document,`touchend touchcancel contextmenu`,this._cancel,this),H(document,`touchmove`,this._onMove,this)}},_cancelClickPrevent:function e(){W(document,`touchend`,G),W(document,`touchend touchcancel`,e)},_cancel:function(){clearTimeout(this._holdTimeout),W(document,`touchend touchcancel contextmenu`,this._cancel,this),W(document,`touchmove`,this._onMove,this)},_onMove:function(e){var t=e.touches[0];this._newPos=new x(t.clientX,t.clientY)},_isTapValid:function(){return this._newPos.distanceTo(this._startPos)<=this._map.options.tapTolerance},_simulateEvent:function(e,t){var n=new MouseEvent(e,{bubbles:!0,cancelable:!0,view:window,screenX:t.screenX,screenY:t.screenY,clientX:t.clientX,clientY:t.clientY});n._simulated=!0,t.target.dispatchEvent(n)}});K.addInitHook(`addHandler`,`tapHold`,ri),K.mergeOptions({touchZoom:M.touch,bounceAtZoomLimits:!0});var ii=bn.extend({addHooks:function(){I(this._map._container,`leaflet-touch-zoom`),H(this._map._container,`touchstart`,this._onTouchStart,this)},removeHooks:function(){R(this._map._container,`leaflet-touch-zoom`),W(this._map._container,`touchstart`,this._onTouchStart,this)},_onTouchStart:function(e){var t=this._map;if(!(!e.touches||e.touches.length!==2||t._animatingZoom||this._zooming)){var n=t.mouseEventToContainerPoint(e.touches[0]),r=t.mouseEventToContainerPoint(e.touches[1]);this._centerPoint=t.getSize()._divideBy(2),this._startLatLng=t.containerPointToLatLng(this._centerPoint),t.options.touchZoom!==`center`&&(this._pinchStartLatLng=t.containerPointToLatLng(n.add(r)._divideBy(2))),this._startDist=n.distanceTo(r),this._startZoom=t.getZoom(),this._moved=!1,this._zooming=!0,t._stop(),H(document,`touchmove`,this._onTouchMove,this),H(document,`touchend touchcancel`,this._onTouchEnd,this),G(e)}},_onTouchMove:function(e){if(!(!e.touches||e.touches.length!==2||!this._zooming)){var t=this._map,n=t.mouseEventToContainerPoint(e.touches[0]),r=t.mouseEventToContainerPoint(e.touches[1]),a=n.distanceTo(r)/this._startDist;if(this._zoom=t.getScaleZoom(a,this._startZoom),!t.options.bounceAtZoomLimits&&(this._zoom<t.getMinZoom()&&a<1||this._zoom>t.getMaxZoom()&&a>1)&&(this._zoom=t._limitZoom(this._zoom)),t.options.touchZoom===`center`){if(this._center=this._startLatLng,a===1)return}else{var o=n._add(r)._divideBy(2)._subtract(this._centerPoint);if(a===1&&o.x===0&&o.y===0)return;this._center=t.unproject(t.project(this._pinchStartLatLng,this._zoom).subtract(o),this._zoom)}this._moved||=(t._moveStart(!0,!1),!0),v(this._animRequest);var s=i(t._move,t,this._center,this._zoom,{pinch:!0,round:!1},void 0);this._animRequest=_(s,this,!0),G(e)}},_onTouchEnd:function(){if(!this._moved||!this._zooming){this._zooming=!1;return}this._zooming=!1,v(this._animRequest),W(document,`touchmove`,this._onTouchMove,this),W(document,`touchend touchcancel`,this._onTouchEnd,this),this._map.options.zoomAnimation?this._map._animateZoom(this._center,this._map._limitZoom(this._zoom),!0,this._map.options.zoomSnap):this._map._resetView(this._center,this._map._limitZoom(this._zoom))}});K.addInitHook(`addHandler`,`touchZoom`,ii),K.BoxZoom=Zr,K.DoubleClickZoom=Qr,K.Drag=$r,K.Keyboard=ei,K.ScrollWheelZoom=ti,K.TapHold=ri,K.TouchZoom=ii,e.Bounds=C,e.Browser=M,e.CRS=fe,e.Canvas=Hr,e.Circle=ar,e.CircleMarker=rr,e.Class=y,e.Control=q,e.DivIcon=Nr,e.DivOverlay=Or,e.DomEvent=ln,e.DomUtil=Jt,e.Draggable=Sn,e.Evented=ue,e.FeatureGroup=Xn,e.GeoJSON=ur,e.GridLayer=Fr,e.Handler=bn,e.Icon=Zn,e.ImageOverlay=Sr,e.LatLng=D,e.LatLngBounds=T,e.Layer=X,e.LayerGroup=Jn,e.LineUtil=Vn,e.Map=K,e.Marker=er,e.Mixin=xn,e.Path=nr,e.Point=x,e.PolyUtil=En,e.Polygon=cr,e.Polyline=$,e.Popup=kr,e.PosAnimation=un,e.Projection=Wn,e.Rectangle=Yr,e.Renderer=Vr,e.SVG=qr,e.SVGOverlay=Er,e.TileLayer=Lr,e.Tooltip=jr,e.Transformation=ge,e.Util=ce,e.VideoOverlay=wr,e.bind=i,e.bounds=w,e.canvas=Ur,e.circle=or,e.circleMarker=ir,e.control=fn,e.divIcon=Pr,e.extend=n,e.featureGroup=Z,e.geoJSON=br,e.geoJson=xr,e.gridLayer=Ir,e.icon=Qn,e.imageOverlay=Cr,e.latLng=O,e.latLngBounds=E,e.layerGroup=Yn,e.map=dn,e.marker=tr,e.point=S,e.polygon=lr,e.polyline=sr,e.popup=Ar,e.rectangle=Xr,e.setOptions=p,e.stamp=o,e.svg=Jr,e.svgOverlay=Dr,e.tileLayer=Rr,e.tooltip=Mr,e.transformation=_e,e.version=t,e.videoOverlay=Tr;var ai=window.L;e.noConflict=function(){return window.L=ai,this},window.L=e}))})),f=c(d(),1),p={key:`de27deab99d785fc6d1cf5ea64200794`,securityJsCode:`4d0564f442a8150fd4209442f4e2fcde`,plugins:[`AMap.AutoComplete`,`AMap.PlaceSearch`,`AMap.Geolocation`]},m={center:[23.129112,113.264385],zoom:16},ee=`/api/v1/tiles/relay`,h={enabled:!0,provider:`world`,ionToken:``,url:``,exaggeration:1.35,demoView:{lng:86.925,lat:27.988,height:9e3,heading:28,pitch:-34}},g=Math.PI,te=6378245,ne=.006693421622965943;function re(e,t){return e<72.004||e>137.8347||t<.8293||t>55.8271}function ie(e,t){let n=-100+2*e+3*t+.2*t*t+.1*e*t+.2*Math.sqrt(Math.abs(e));return n+=(20*Math.sin(6*e*g)+20*Math.sin(2*e*g))*2/3,n+=(20*Math.sin(t*g)+40*Math.sin(t/3*g))*2/3,n+=(160*Math.sin(t/12*g)+320*Math.sin(t*g/30))*2/3,n}function ae(e,t){let n=300+e+2*t+.1*e*e+.1*e*t+.1*Math.sqrt(Math.abs(e));return n+=(20*Math.sin(6*e*g)+20*Math.sin(2*e*g))*2/3,n+=(20*Math.sin(e*g)+40*Math.sin(e/3*g))*2/3,n+=(150*Math.sin(e/12*g)+300*Math.sin(e/30*g))*2/3,n}function oe([e,t]){if(re(e,t))return[e,t];let n=ie(e-105,t-35),r=ae(e-105,t-35),i=t/180*g,a=Math.sin(i);a=1-ne*a*a;let o=Math.sqrt(a);return n=n*180/(te*(1-ne)/(a*o)*g),r=r*180/(te/o*Math.cos(i)*g),[e+r,t+n]}function se([e,t]){if(re(e,t))return[e,t];let n=e-.02,r=e+.02,i=t-.02,a=t+.02,o=e,s=t;for(let c=0;c<30;c++){o=(n+r)/2,s=(i+a)/2;let[c,l]=oe([o,s]),u=c-e,d=l-t;if(Math.abs(u)<1e-9&&Math.abs(d)<1e-9)return[o,s];u>0?r=o:n=o,d>0?a=s:i=s}return[o,s]}function _(e){return Array.isArray(e)?typeof e[0]==`number`&&typeof e[1]==`number`?oe(e):e.map(_):e}var v={enableHighAccuracy:!0,timeout:12e3,maximumAge:0};function ce(e){return e?.Geolocation?new e.Geolocation({enableHighAccuracy:!0,timeout:12e3,maximumAge:0,convert:!0,showButton:!1,showMarker:!1,showCircle:!1,panToLocation:!1,zoomToAccuracy:!1}):(console.warn(`高德定位插件加载失败，将仅使用浏览器定位`),null)}function y(e){let t=Number(e);return Number.isFinite(t)?t:null}function le(e){let t=y(e?.lat),n=y(e?.lng);return t!==null&&n!==null&&Math.abs(t)<=90&&Math.abs(n)<=180}function b(e){return e<0?e+360:e}function ue(e){let t=Number(e.lat),n=Number(e.lng);if(e.coordType===`gcj02`)return{lat:t,lng:n,accuracy:e.accuracy,source:e.source,locationType:e.locationType};let[r,i]=oe([n,t]);return{lat:i,lng:r,accuracy:e.accuracy,source:e.source,locationType:e.locationType}}function x(e){let t=ue(e);return[t.lat,b(t.lng)]}function de(e){let t=e?.position,n=y(typeof t?.getLat==`function`?t.getLat():t?.lat),r=y(typeof t?.getLng==`function`?t.getLng():t?.lng);return n===null||r===null?null:{lat:n,lng:r,accuracy:y(e.accuracy),source:`amap`,coordType:`gcj02`,locationType:e.location_type||e.locationType||``}}function S(e){return new Promise((t,n)=>{if(!e?.getCurrentPosition){n(Error(`高德定位实例不可用`));return}e.getCurrentPosition((e,r)=>{if(e===`complete`){let e=de(r);if(e){t(e);return}}let i=r?.message||r?.info||`高德定位失败`;n(Error(i))})})}function C(){return new Promise((e,t)=>{if(!navigator.geolocation){t(Error(`你的浏览器不支持当前地理位置信息获取`));return}navigator.geolocation.getCurrentPosition(t=>{e({lat:t.coords.latitude,lng:t.coords.longitude,accuracy:y(t.coords.accuracy),source:`browser`,coordType:`wgs84`,locationType:`html5`})},t,v)})}async function w(e){if(e)try{return await S(e)}catch(e){console.warn(`高德定位失败，改用浏览器定位`,e)}return C()}function T(){let e=document.getElementById(`app-dialog-root`);return e||(e=document.createElement(`div`),e.id=`app-dialog-root`,document.body.appendChild(e)),e}function E(e){return String(e??``).replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function D(e,t,n,r){t(),e.innerHTML=``,e.hidden=!0,n(r)}function O(e={}){let t=T(),n=e.title||`提示`,r=e.message||``,i=e.confirmText||`确定`,a=e.cancelText||`取消`,o=!!e.showCancel,s=e.checkbox||null;t.hidden=!1,t.innerHTML=`
    <div class="app-dialog-backdrop" data-dialog-action="cancel">
      <section class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <h2 id="app-dialog-title">${E(n)}</h2>
        <p>${E(r)}</p>
        ${s?`
          <label class="app-dialog-check">
            <input type="checkbox" data-dialog-checkbox ${s.checked?`checked`:``}>
            <span>${E(s.label||``)}</span>
          </label>
        `:``}
        <div class="app-dialog-actions">
          ${o?`<button type="button" class="app-dialog-secondary" data-dialog-action="cancel">${E(a)}</button>`:``}
          <button type="button" class="app-dialog-primary" data-dialog-action="confirm">${E(i)}</button>
        </div>
      </section>
    </div>
  `;let c=t.querySelector(`.app-dialog`);return t.querySelector(`.app-dialog-primary`)?.focus(),new Promise(e=>{let n=()=>{t.removeEventListener(`click`,i),document.removeEventListener(`keydown`,a)},r=r=>{let i=!!t.querySelector(`[data-dialog-checkbox]`)?.checked;D(t,n,e,s?{confirmed:r,checked:i}:r)},i=e=>{let t=e.target.closest(`[data-dialog-action]`);t&&(c?.contains(e.target)&&t.classList.contains(`app-dialog-backdrop`)||r(t.dataset.dialogAction===`confirm`))},a=e=>{e.key===`Escape`&&(e.preventDefault(),r(!1))};t.addEventListener(`click`,i),document.addEventListener(`keydown`,a)})}function fe(e,t={}){return O({title:t.title||`提示`,message:e,confirmText:t.confirmText||`知道了`})}function pe(e,t={}){return O({title:t.title||`确认操作`,message:e,confirmText:t.confirmText||`确认`,cancelText:t.cancelText||`取消`,showCancel:!0})}function me(e,t={}){return O({title:t.title||`确认操作`,message:e,confirmText:t.confirmText||`确认`,cancelText:t.cancelText||`取消`,showCancel:!0,checkbox:{label:t.checkboxLabel||``,checked:!!t.checked}})}function he(e={}){let t=T(),n=e.title||`编辑属性`,r=e.fields||[],i=e.values||{},a=e.confirmText||`保存`,o=e.cancelText||`取消`;t.hidden=!1,t.innerHTML=`
    <div class="app-dialog-backdrop" data-dialog-action="cancel">
      <form class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" data-dialog-form autocomplete="off">
        <h2 id="app-dialog-title">${E(n)}</h2>
        <div class="app-dialog-body" style="margin: 16px 0; text-align: left;">
          ${r.map(e=>{let t=E(i[e.name]||``);return e.type===`select`?`
                <label style="display: block; margin-bottom: 12px;">
                  <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${E(e.label)}</span>
                  <select name="${E(e.name)}" style="width: 100%; height: 36px; padding: 0 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 13px; outline: none; background: #fff;">
                    ${(e.options||[]).map(t=>{let n=typeof t==`object`?t.value:t,r=typeof t==`object`?t.label:t,a=String(i[e.name]??``)===String(n)?`selected`:``;return`<option value="${E(n)}" ${a}>${E(r)}</option>`}).join(``)}
                  </select>
                </label>
              `:e.type===`textarea`?`
                <label style="display: block; margin-bottom: 12px;">
                  <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${E(e.label)}</span>
                  <textarea name="${E(e.name)}" rows="3" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-family: inherit; font-size: 13px; resize: vertical; outline: none;"></textarea>
                </label>
                `:`
              <label style="display: block; margin-bottom: 12px;">
                <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${E(e.label)}</span>
                <input type="text" name="${E(e.name)}" value="${t}" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 13px; outline: none;" required>
              </label>
            `}).join(``)}
        </div>
        <div class="app-dialog-actions">
          <button type="button" class="app-dialog-secondary" data-dialog-action="cancel">${E(o)}</button>
          <button type="submit" class="app-dialog-primary">${E(a)}</button>
        </div>
      </form>
    </div>
  `;let s=t.querySelector(`[data-dialog-form]`);return r.forEach(e=>{if(e.type===`textarea`){let t=s.querySelector(`textarea[name="${e.name}"]`);t&&(t.value=i[e.name]||``)}}),t.querySelector(`.app-dialog-primary`)?.focus(),new Promise(e=>{let n=()=>{t.removeEventListener(`click`,i),s?.removeEventListener(`submit`,r),document.removeEventListener(`keydown`,a)},r=r=>{r.preventDefault();let i=new FormData(s),a={};for(let[e,t]of i.entries())a[e]=t;D(t,n,e,a)},i=r=>{let i=r.target.closest(`[data-dialog-action]`);i&&(s?.contains(r.target)&&i.classList.contains(`app-dialog-backdrop`)||i.dataset.dialogAction===`cancel`&&D(t,n,e,null))},a=r=>{r.key===`Escape`&&(r.preventDefault(),D(t,n,e,null))};t.addEventListener(`click`,i),s?.addEventListener(`submit`,r),document.addEventListener(`keydown`,a)})}var ge=`/api/v1`,_e=`mapServiceAdminToken`;function ve(){return window.localStorage.getItem(_e)||``}function ye(e){e?window.localStorage.setItem(_e,e):window.localStorage.removeItem(_e)}async function k(e,t={}){let n={Accept:`application/json`,...t.headers||{}};if(t.body!==void 0&&(typeof window<`u`&&t.body instanceof window.FormData||(n[`Content-Type`]=`application/json`)),t.auth!==!1){let e=ve();e&&(n.Authorization=`Bearer ${e}`)}let r=await window.fetch(`${ge}${e}`,{method:t.method||`GET`,headers:n,body:t.body===void 0?void 0:typeof window<`u`&&t.body instanceof window.FormData?t.body:JSON.stringify(t.body)}),i=await r.json().catch(()=>null);if(!r.ok||i?.code!==0){let e=i?.error?.message||r.statusText||`请求失败`,t=Error(e);throw t.status=r.status,t}return i.result}async function be(e){let t=await k(`/admin/auth/login`,{method:`POST`,auth:!1,body:e});return ye(t.token),t}function xe(){ye(``)}var A={session:()=>k(`/admin/session`),system:()=>k(`/admin/system`),cache:()=>k(`/admin/cache`),clearCache:(e={})=>{let t=new URLSearchParams(e).toString();return k(`/admin/cache${t?`?${t}`:``}`,{method:`DELETE`})},visits:()=>k(`/admin/visits`),settings:()=>k(`/admin/settings`),updateSettings:e=>k(`/admin/settings`,{method:`PUT`,body:e}),updatePassword:e=>k(`/admin/auth/password`,{method:`POST`,body:e}),precacheCatalog:()=>k(`/admin/precache/catalog`),tasks:()=>k(`/admin/precache/tasks`),estimateTask:e=>k(`/admin/precache/estimate`,{method:`POST`,body:e}),createTask:e=>k(`/admin/precache/tasks`,{method:`POST`,body:e}),pauseTask:e=>k(`/admin/precache/tasks/${encodeURIComponent(e)}/pause`,{method:`POST`}),resumeTask:e=>k(`/admin/precache/tasks/${encodeURIComponent(e)}/resume`,{method:`POST`}),deleteTask:(e,t={})=>{let n=new URLSearchParams;t.deleteCache&&n.set(`deleteCache`,`true`);let r=n.toString();return k(`/admin/precache/tasks/${encodeURIComponent(e)}${r?`?${r}`:``}`,{method:`DELETE`})},kmls:()=>k(`/admin/kml`),getKml:e=>k(`/admin/kml/${encodeURIComponent(e)}`),createKml:e=>k(`/admin/kml`,{method:`POST`,body:e}),updateKml:(e,t)=>k(`/admin/kml/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteKml:e=>k(`/admin/kml/${encodeURIComponent(e)}`,{method:`DELETE`}),importKml:e=>k(`/admin/kml/import`,{method:`POST`,body:e}),listTileSources:()=>k(`/admin/tile-sources`),createTileSource:e=>k(`/admin/tile-sources`,{method:`POST`,body:e}),getTileSource:e=>k(`/admin/tile-sources/${encodeURIComponent(e)}`),updateTileSource:(e,t)=>k(`/admin/tile-sources/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteTileSource:e=>k(`/admin/tile-sources/${encodeURIComponent(e)}`,{method:`DELETE`}),testTileSource:e=>k(`/admin/tile-sources/${encodeURIComponent(e)}/test`,{method:`POST`}),listSourcePresets:()=>k(`/admin/source-presets`),createSourceFromPreset:(e,t)=>k(`/admin/source-presets/${encodeURIComponent(e)}/create-source`,{method:`POST`,body:t}),listKeyPools:()=>k(`/admin/key-pools`),getKeyPool:e=>k(`/admin/key-pools/${encodeURIComponent(e)}`),createKeyPool:e=>k(`/admin/key-pools`,{method:`POST`,body:e}),updateKeyPool:(e,t)=>k(`/admin/key-pools/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteKeyPool:e=>k(`/admin/key-pools/${encodeURIComponent(e)}`,{method:`DELETE`}),testKeyPool:e=>k(`/admin/key-pools/${encodeURIComponent(e)}/test`,{method:`POST`}),testKeyPoolKey:(e,t)=>k(`/admin/key-pools/${encodeURIComponent(e)}/keys/${encodeURIComponent(t)}/test`,{method:`POST`}),listMapLayers:()=>k(`/admin/map-layers`),createMapLayer:e=>k(`/admin/map-layers`,{method:`POST`,body:e}),updateMapLayer:(e,t)=>k(`/admin/map-layers/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteMapLayer:e=>k(`/admin/map-layers/${encodeURIComponent(e)}`,{method:`DELETE`}),setDefaultMapLayer:e=>k(`/admin/map-layers-default`,{method:`PUT`,body:{id:e}}),listProxyOutbounds:()=>k(`/admin/proxy-outbounds`),createProxyOutbound:e=>k(`/admin/proxy-outbounds`,{method:`POST`,body:e}),updateProxyOutbound:(e,t)=>k(`/admin/proxy-outbounds/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteProxyOutbound:e=>k(`/admin/proxy-outbounds/${encodeURIComponent(e)}`,{method:`DELETE`}),testProxyOutbound:e=>k(`/admin/proxy-outbounds/${encodeURIComponent(e)}/test`,{method:`POST`}),listProxyPools:()=>k(`/admin/proxy-pools`),createProxyPool:e=>k(`/admin/proxy-pools`,{method:`POST`,body:e}),updateProxyPool:(e,t)=>k(`/admin/proxy-pools/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteProxyPool:e=>k(`/admin/proxy-pools/${encodeURIComponent(e)}`,{method:`DELETE`}),testProxyPool:e=>k(`/admin/proxy-pools/${encodeURIComponent(e)}/test`,{method:`POST`}),listExternalPublishes:()=>k(`/admin/external-publishes`),createExternalPublish:e=>k(`/admin/external-publishes`,{method:`POST`,body:e}),updateExternalPublish:(e,t)=>k(`/admin/external-publishes/${encodeURIComponent(e)}`,{method:`PUT`,body:t}),deleteExternalPublish:e=>k(`/admin/external-publishes/${encodeURIComponent(e)}`,{method:`DELETE`}),resetExternalPublishToken:e=>k(`/admin/external-publishes/${encodeURIComponent(e)}/token`,{method:`POST`}),testExternalPublish:e=>k(`/admin/external-publishes/${encodeURIComponent(e)}/test`,{method:`POST`}),listExternalPublishLogs:(e=``)=>k(e?`/admin/external-publishes/${encodeURIComponent(e)}/logs`:`/admin/external-publish-logs`),listSourceAccessLogs:(e=``)=>k(e?`/admin/tile-sources/${encodeURIComponent(e)}/access-logs`:`/admin/source-access-logs`)};async function Se(){return k(`/access/status`,{auth:!1})}async function Ce(e){return k(`/access/verify`,{method:`POST`,auth:!1,body:{password:e}})}function we(e=0){if(!e)return`0 B`;let t=[`B`,`KB`,`MB`,`GB`],n=e,r=0;for(;n>=1024&&r<t.length-1;)n/=1024,r+=1;return`${n.toFixed(r===0?0:1)} ${t[r]}`}function Te(e=0){let t=Math.floor(e),n=Math.floor(t/3600),r=Math.floor(t%3600/60),i=t%60;return n?`${n}h ${r}m`:r?`${r}m ${i}s`:`${i}s`}function Ee(e){return e?new Date(e).toLocaleString():`-`}function j(e){return String(e??``).replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#39;`)}function De(e,t){return`${e}?url=${encodeURIComponent(t).replace(/%7B/g,`{`).replace(/%7D/g,`}`)}`}function Oe(e){let t=e.system,n=e.visits||{},r=t?.package?.version||`-`,i=e.visitsError||(e.visitsLoading?`统计中`:``);return`
    <div class="admin-grid">
      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>系统</h2>
          <span class="admin-badge">${j(r)}</span>
        </div>
        <dl class="admin-metrics">
          <div><dt>应用</dt><dd>${j(t?.package?.name||`-`)}</dd></div>
          <div><dt>Node</dt><dd>${j(t?.node||`-`)}</dd></div>
          <div><dt>进程</dt><dd>${j(t?.pid||`-`)}</dd></div>
          <div><dt>运行</dt><dd>${Te(t?.uptime||0)}</dd></div>
          <div><dt>环境</dt><dd>${j(t?.env||`-`)}</dd></div>
          <div><dt>时间</dt><dd>${Ee(t?.serverTime)}</dd></div>
        </dl>
      </section>
      <section class="admin-panel admin-panel-wide">
        <div class="admin-panel-head">
          <h2>访问</h2>
          <span class="admin-badge">${j(i||n.total||0)}</span>
        </div>
        <div class="admin-stat-row">
          ${Object.entries(n.statusGroups||{}).map(([e,t])=>{let n=``;return e.startsWith(`2`)?n=`status-2xx`:e.startsWith(`3`)?n=`status-3xx`:(e.startsWith(`4`)||e.startsWith(`5`))&&(n=`status-err`),`<div class="${n}"><span>${j(e)}</span><strong>${t}</strong></div>`}).join(``)||`<div><span>请求</span><strong>${j(i||0)}</strong></div>`}
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>方法</th><th>路径</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              ${(n.recentRequests||[]).slice(0,8).map(e=>{let t=``;return String(e.status).startsWith(`2`)?t=`badge-2xx`:String(e.status).startsWith(`3`)?t=`badge-3xx`:(String(e.status).startsWith(`4`)||String(e.status).startsWith(`5`))&&(t=`badge-err`),`
                  <tr>
                    <td><code class="admin-method-code">${j(e.method)}</code></td>
                    <td class="admin-path-td">${j(e.path)}</td>
                    <td><span class="admin-status-badge ${t}">${j(e.status)}</span></td>
                    <td class="admin-time-td">${j(e.timestamp)}</td>
                  </tr>
                `}).join(``)||`<tr><td colspan="4">暂无访问记录</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `}function ke(e){let t=e.cache||{},n=e.cacheError||(e.cacheLoading?`统计中`:``),r=t.bySource||{},i=e.tileSources||[];return`
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>缓存治理</h2>
        <button type="button" class="btn-danger" data-admin-action="clear-cache">清空全部缓存</button>
      </div>
      
      <dl class="admin-metrics admin-metrics-five">
        <div class="metric-files"><dt>文件数</dt><dd>${j(n||t.files||0)}</dd></div>
        <div class="metric-size"><dt>总大小</dt><dd>${we(t.bytes||0)}</dd></div>
        <div class="metric-fresh"><dt>新鲜数</dt><dd>${t.fresh||0}</dd></div>
        <div class="metric-stale"><dt>可回退</dt><dd>${t.stale||0}</dd></div>
        <div class="metric-expired"><dt>过期数</dt><dd>${t.expired||0}</dd></div>
      </dl>

      <div class="admin-table-wrapper" style="margin-top: 24px;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>图源名称</th>
              <th>图源 ID</th>
              <th>文件数</th>
              <th>体积大小</th>
              <th>状态分布 (新鲜/可回退/过期)</th>
              <th class="actions">操作</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(r).map(([e,t])=>{let n=i.find(t=>t.id===e);return`
                <tr>
                  <td><strong>${j(n?n.name:`专用/未知图源`)}</strong></td>
                  <td><code class="code-slug">${j(e)}</code></td>
                  <td>${t.files||0}</td>
                  <td>${we(t.size||0)}</td>
                  <td>
                    <span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: none; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${t.fresh||0}</span>
                    <span class="status-badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: none; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${t.stale||0}</span>
                    <span class="status-badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: none; font-weight: bold; padding: 2px 6px; border-radius: 4px;">${t.expired||0}</span>
                  </td>
                  <td class="actions">
                    <button type="button" class="btn-danger-sm" data-admin-action="clear-source-cache" data-source-id="${j(e)}">清理缓存</button>
                  </td>
                </tr>
              `}).join(``)||`<tr><td colspan="6" class="empty-row">暂无分源缓存数据</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `}async function Ae({api:e,event:t,renderDashboard:n,setNotice:r,showConfirm:i,state:a}){let o=t.target.closest(`[data-admin-action]`);if(!o)return!1;let s=o.getAttribute(`data-admin-action`);if(s===`clear-cache`){if(!await i(`清空所有瓦片缓存？此操作不可逆！`))return!0;try{await e.clearCache(),a.cache=await e.cache(),r(`所有瓦片缓存已清空`),n()}catch(e){r(``,e.message),n()}return!0}if(s===`clear-source-cache`){let t=o.getAttribute(`data-source-id`);if(!t)return!1;let s=(a.tileSources||[]).find(e=>e.id===t),c=s?s.name:t;if(!await i(`确定要清空图源【${c}】的全部瓦片缓存吗？`))return!0;try{await e.clearCache({sourceId:t}),a.cache=await e.cache(),r(`已清空图源【${c}】的专属瓦片缓存`),n()}catch(e){r(``,e.message),n()}return!0}return!1}var je={queued:`排队中`,running:`执行中`,pausing:`暂停中`,paused:`已暂停`,completed:`已完成`,completed_with_errors:`完成有错误`,failed:`失败`,interrupted:`已中断`,deleting:`删除中`},Me=1e3,Ne=1500,Pe=new Set([`queued`,`running`,`pausing`,`deleting`]),Fe=null,Ie=0,Le=``,Re=``,ze=null,Be=0;function Ve(e){return je[e]||e}var He={queued:`⏳`,running:`⚙`,pausing:`⏸`,paused:`⏸`,completed:`✓`,completed_with_errors:`⚠`,failed:`✗`,interrupted:`⏹`,deleting:`🗑`};function Ue(e){return He[e]||`•`}function We(e,t){let n=t[0],r=e.precacheForm||{};return{providerId:t.some(e=>e.id===r.providerId)?r.providerId:n?.id||``,bounds:{west:Number(r.bounds?.west??113.24),south:Number(r.bounds?.south??23.11),east:Number(r.bounds?.east??113.29),north:Number(r.bounds?.north??23.15)},minZoom:Number(r.minZoom??12),maxZoom:Number(r.maxZoom??12),concurrency:Number(r.concurrency??4),requestIntervalMs:Number(r.requestIntervalMs??0),refresh:!!r.refresh}}function Ge(e,t){return e.find(e=>e.id===t.providerId)||e[0]||null}function Ke(e){let t=e.expandedTaskIds||new Set;return(e.tasks||[]).map(e=>({...e,expanded:t.has(e.id)}))}function qe(e=[]){return e.some(e=>Pe.has(e.status))}function Je(e){let t=e.precacheCatalog||[],n=We(e,t),r=Ge(t,n),i=Ke(e);return`
    <div class="admin-precache-stack">
      <section class="admin-panel admin-panel-wide admin-precache-form-panel">
        <div class="admin-panel-head">
          <h2>预缓存区域</h2>
          <button type="button" data-admin-action="sync-bounds">取当前视野</button>
        </div>
        <form class="admin-search-form" data-place-search-form>
          <input name="keyword" placeholder="搜索地点，例如：广州塔" autocomplete="off">
          <button type="submit">搜索</button>
        </form>
        <div class="admin-search-results" data-place-search-results></div>
        <div id="admin-precache-map" class="admin-precache-map"></div>
        <div class="admin-map-resizer" title="拖动调整地图高度"><span class="admin-map-resizer-line"></span></div>
        <form class="admin-form admin-precache-form" data-precache-form>
          <label>
            <span>缓存图源/图层</span>
            <select name="providerId">
              <optgroup label="系统图源 (可预缓存)">
                ${t.filter(e=>e.type===`source`).map(e=>`
                  <option value="${j(e.id)}" data-type="source" ${e.id===n.providerId?`selected`:``}>
                    ${j(e.name)} (Z${e.minZoom}-Z${e.maxZoom})
                  </option>
                `).join(``)}
              </optgroup>
              <optgroup label="组合图层 (将自动拆分为多个预缓存任务)">
                ${t.filter(e=>e.type===`layer`).map(e=>`
                  <option value="${j(e.id)}" data-type="layer" ${e.id===n.providerId?`selected`:``}>
                    ${j(e.name)} (Z${e.minZoom}-Z${e.maxZoom})
                  </option>
                `).join(``)}
              </optgroup>
            </select>
          </label>
          <div class="admin-field-grid">
            <label><span>西</span><input name="west" type="number" step="0.000001" value="${j(n.bounds.west)}" required></label>
            <label><span>南</span><input name="south" type="number" step="0.000001" value="${j(n.bounds.south)}" required></label>
            <label><span>东</span><input name="east" type="number" step="0.000001" value="${j(n.bounds.east)}" required></label>
            <label><span>北</span><input name="north" type="number" step="0.000001" value="${j(n.bounds.north)}" required></label>
          </div>
          <div class="admin-field-grid">
            <label><span>最小级别</span><input name="minZoom" type="number" min="${r?.minZoom||3}" max="${r?.maxZoom||18}" value="${j(n.minZoom)}" required></label>
            <label><span>最大级别</span><input name="maxZoom" type="number" min="${r?.minZoom||3}" max="${r?.maxZoom||18}" value="${j(n.maxZoom)}" required></label>
            <label><span>并发</span><input name="concurrency" type="number" min="1" max="64" value="${j(n.concurrency)}" required></label>
            <label><span>请求间隔 ms</span><input name="requestIntervalMs" type="number" min="0" max="60000" value="${j(n.requestIntervalMs)}" required></label>
            <label class="admin-check admin-check-field"><input name="refresh" type="checkbox" ${n.refresh?`checked`:``}><span>刷新已有缓存</span></label>
          </div>
          ${Ye(e)}
          <button type="submit">创建任务</button>
        </form>
      </section>
      ${$e(i)}
    </div>
  `}function Ye(e){let t=e.precacheEstimate;return e.precacheEstimateStatus===`loading`?`<div class="admin-estimate" data-precache-estimate><p>正在估算瓦片数量和下载体积</p></div>`:e.precacheEstimateError?`<div class="admin-estimate is-error" data-precache-estimate><p>${j(e.precacheEstimateError)}</p></div>`:t?`
    <div class="admin-estimate ${t.withinLimit?``:`is-warning`}" data-precache-estimate>
      <dl class="admin-metrics">
        <div><dt>预计文件</dt><dd>${j(t.total||0)}</dd></div>
        <div><dt>估算体积</dt><dd>${we(t.estimatedBytesRange?.min||0)} - ${we(t.estimatedBytesRange?.max||0)}</dd></div>
        <div><dt>建议上限</dt><dd>${j(t.maxTiles||0)}</dd></div>
        <div><dt>建议</dt><dd>${t.withinLimit?`可以创建`:`任务较大，建议设置请求间隔`}</dd></div>
      </dl>
      <p>${Qe(t)}</p>
    </div>
  `:`<div class="admin-estimate" data-precache-estimate><p>停止移动地图后会自动估算任务规模</p></div>`}function Xe(e){let t=e.root?.querySelector(`[data-precache-estimate]`);t&&(t.outerHTML=Ye(e))}function Ze(e){return e.length?e.map(e=>`Z${e.z}: ${e.count}`).join(`，`):`暂无分级明细`}function Qe(e){if(e.targetType===`layer`){let t=e.sources||[];return t.length?t.map(e=>`${e.sourceName||e.sourceId}: ${e.total||0} 张，约 ${we(e.estimatedBytes||0)}`).join(`，`):`暂无可预缓存图源明细`}return Ze(e.ranges||[])}function $e(e){return`
    <section class="admin-panel admin-panel-wide admin-precache-task-panel" data-precache-task-panel>
      <div class="admin-panel-head">
        <h2>任务</h2>
        <span class="admin-badge">${e.length}</span>
      </div>
      <div class="admin-task-list">
        ${e.slice(0,10).map(e=>et(e)).join(``)||`<p class="admin-empty">暂无任务</p>`}
      </div>
    </section>
  `}function et(e){let t=e.expanded;return`
    <article class="admin-task-card">
      <div class="admin-task-main">
        <div class="admin-task-title">
          <span class="admin-status admin-status-${e.status}" title="${j(Ve(e.status))}">${j(Ue(e.status))}</span>
          <strong>${j(e.providerId)}</strong>
          <small>${Ee(e.updatedAt)}</small>
        </div>
        ${tt(e)}
      </div>
      <dl class="admin-task-summary">
        <div><dt>体积</dt><dd>${we(e.bytes||0)}</dd></div>
        <div><dt>级别</dt><dd>${j(e.minZoom)}-${j(e.maxZoom)}</dd></div>
        <div><dt>并发</dt><dd>${j(e.concurrency||0)}</dd></div>
        <div><dt>间隔</dt><dd>${j(e.requestIntervalMs||0)}ms</dd></div>
      </dl>
      ${nt(e)}
      ${t?M(e):``}
    </article>
  `}function tt(e){let t=Number(e.completed||0),n=Number(e.total||0),r=n?Math.min(100,Math.round(t/n*100)):0;return`
    <div class="admin-task-progress">
      <span>${j(t)} / ${j(n)} (${r}%)</span>
      <small>成功 ${j(e.succeeded||0)}，失败 ${j(e.failed||0)}</small>
    </div>
  `}function nt(e){let t=[`queued`,`running`].includes(e.status),n=[`paused`,`interrupted`,`failed`,`completed_with_errors`].includes(e.status),r=e.status!==`deleting`,i=e.expanded?`收起`:`详情`;return`
    <div class="admin-task-actions">
      ${t?`<button type="button" data-precache-task-action="pause" data-task-id="${j(e.id)}">暂停</button>`:``}
      ${n?`<button type="button" data-precache-task-action="resume" data-task-id="${j(e.id)}">继续/重试</button>`:``}
      <button type="button" data-precache-task-action="edit" data-task-id="${j(e.id)}">编辑</button>
      <button type="button" data-precache-task-action="update" data-task-id="${j(e.id)}">更新</button>
      ${r?`<button type="button" data-precache-task-action="preview" data-task-id="${j(e.id)}">预览</button>`:``}
      <button type="button" data-precache-task-action="toggle-details" data-task-id="${j(e.id)}">${i}</button>
      <button type="button" class="danger" data-precache-task-action="delete" data-task-id="${j(e.id)}">删除</button>
    </div>
  `}function M(e){let t=e.bounds||{},n=e.ranges||[],r=e.errors||[],i=Object.values(e.failedTiles||{});return`
    <div class="admin-task-details">
      <dl>
        <div><dt>区域</dt><dd>西 ${j(t.west)} / 南 ${j(t.south)} / 东 ${j(t.east)} / 北 ${j(t.north)}</dd></div>
        <div><dt>级别明细</dt><dd>${Ze(n)}</dd></div>
        <div><dt>失败待重试</dt><dd>${j(i.length)}</dd></div>
        <div><dt>创建时间</dt><dd>${Ee(e.createdAt)}</dd></div>
        <div><dt>完成时间</dt><dd>${Ee(e.finishedAt)}</dd></div>
      </dl>
      ${i.length?`
        <div class="admin-task-errors">
          ${i.slice(-3).map(e=>`<p>Z${j(e.tile?.z)} / X${j(e.tile?.x)} / Y${j(e.tile?.y)}：${j(e.message||`未知错误`)}</p>`).join(``)}
        </div>
      `:``}
      ${r.length?`
        <div class="admin-task-errors">
          ${r.slice(-3).map(e=>`<p>${j(e.message||`未知错误`)}</p>`).join(``)}
        </div>
      `:``}
    </div>
  `}function rt(e,t){bt(e,t);let n=t.elements.providerId,r=n.options[n.selectedIndex]?.getAttribute(`data-type`)||`source`,i=n.value;return{targetType:r,targetId:i,providerId:i,bounds:{west:Number(t.elements.west.value),south:Number(t.elements.south.value),east:Number(t.elements.east.value),north:Number(t.elements.north.value)},minZoom:Number(t.elements.minZoom.value),maxZoom:Number(t.elements.maxZoom.value),concurrency:Number(t.elements.concurrency.value),requestIntervalMs:Number(t.elements.requestIntervalMs.value),refresh:t.elements.refresh.checked}}function it(e,t){e.tasks=e.tasks.map(e=>e.id===t.id?t:e)}function at(e,t){e.tasks=e.tasks.filter(e=>e.id!==t)}function ot(e){let t=e.root?.querySelector(`[data-precache-task-panel]`);t&&(t.outerHTML=$e(Ke(e)))}function st(e){return Array.isArray(e)?`[${e.map(st).join(`,`)}]`:e&&typeof e==`object`?`{${Object.keys(e).sort().map(t=>`${JSON.stringify(t)}:${st(e[t])}`).join(`,`)}}`:JSON.stringify(e)}function ct(e){Ie+=1,Le=``,e.precacheEstimate=null,e.precacheEstimateStatus=``,e.precacheEstimateError=``,Xe(e)}function N(e,t,n=Me){e.activeTab===`precache`&&(window.clearTimeout(Fe),Fe=window.setTimeout(()=>{lt(e,t)},n))}async function lt(e,t){if(e.activeTab!==`precache`)return;let n=e.root?.querySelector(`[data-precache-form]`);if(!n)return;let r=rt(e,n),i=st(r);if(i===Re||i===Le)return;let a=Ie+1;Ie=a,Le=i,e.precacheEstimateStatus=`loading`,e.precacheEstimateError=``,Xe(e);try{let n=await t.estimateTask(r);if(a!==Ie)return;e.precacheEstimate=n,e.precacheEstimateStatus=``,e.precacheEstimateError=``,Re=i,Le=``,Xe(e)}catch(t){if(a!==Ie)return;e.precacheEstimate=null,e.precacheEstimateStatus=``,e.precacheEstimateError=t.message,Le=``,Xe(e)}}function ut(e,t,n=Ne){window.clearTimeout(ze),!(e.activeTab!==`precache`||!qe(e.tasks))&&(ze=window.setTimeout(()=>{dt(e,t)},n))}async function dt(e,t){if(e.activeTab!==`precache`)return;let n=Be+1;Be=n;try{let r=await t.tasks();if(n!==Be||e.activeTab!==`precache`)return;e.tasks=r,ot(e),ut(e,t)}catch(n){console.warn(`预缓存任务状态刷新失败`,n),ut(e,t,Ne*2)}}async function ft({api:e,event:t,renderDashboard:n,setNotice:r,state:i}){let a=t.target.closest(`[data-precache-form]`),o=t.target.closest(`[data-place-search-form]`);if(a)return t.preventDefault(),e.createTask(rt(i,a)).then(t=>{Array.isArray(t)?(i.tasks=[...t,...i.tasks],r(`成功创建了 ${t.length} 个图源缓存子任务`)):(i.tasks=[t,...i.tasks],r(`预缓存任务已创建`)),n(),ut(i,e,300)}).catch(e=>{r(``,e.message),n()}),!0;if(o){t.preventDefault();let e=o.elements.keyword.value.trim();return e&&await Tt(i,e),!0}return!1}async function pt({api:e,event:t,renderDashboard:n,setNotice:r,showCheckboxConfirm:i,showConfirm:a,state:o}){let s=t.target.closest(`[data-precache-task-action]`);if(s)return await ht({actionTarget:s,api:e,renderDashboard:n,setNotice:r,showCheckboxConfirm:i,showConfirm:a,state:o}),!0;let c=t.target.closest(`[data-place-lng][data-place-lat]`);return c?(Ct(o,Number(c.getAttribute(`data-place-lng`)),Number(c.getAttribute(`data-place-lat`))),!0):t.target.closest(`[data-admin-action]`)?.getAttribute(`data-admin-action`)===`sync-bounds`?(yt(o),ct(o),N(o,e),!0):!1}async function mt({api:e,event:t,state:n}){let r=t.target.closest(`[data-precache-form]`);return r?(bt(n,r),ct(n),N(n,e),!0):!1}async function ht({actionTarget:e,api:t,renderDashboard:n,setNotice:r,showCheckboxConfirm:i,showConfirm:a,state:o}){let s=e.getAttribute(`data-precache-task-action`),c=e.getAttribute(`data-task-id`),l=o.tasks.find(e=>e.id===c);if(!(!s||!c))try{if(s===`pause`){it(o,await t.pauseTask(c)),r(`预缓存任务已暂停`),n(),ut(o,t,300);return}if(s===`resume`){it(o,await t.resumeTask(c)),r(`预缓存任务已继续`),n(),ut(o,t,300);return}if(s===`delete`){let e=!1;if(i instanceof Function){let t=await i(`删除此预缓存任务？执行中的任务会停止并从列表移除。`,{confirmText:`删除`,checkboxLabel:`同时删除该任务范围内已缓存的瓦片文件`});if(!t?.confirmed)return;e=!!t.checked}else if(!await a(`删除此预缓存任务？执行中的任务会停止并从列表移除。`))return;await t.deleteTask(c,{deleteCache:e}),at(o,c),r(e?`预缓存任务已删除，关联缓存文件清理已提交`:`预缓存任务已删除`),n();return}if(s===`edit`&&l){St(o,l),ct(o),N(o,t),r(`任务参数已回填，可调整后创建新任务`),n();return}if(s===`update`&&l){o.tasks=[await t.createTask({providerId:l.providerId,bounds:l.bounds,minZoom:l.minZoom,maxZoom:l.maxZoom,concurrency:l.concurrency,requestIntervalMs:l.requestIntervalMs||0,refresh:!1}),...o.tasks],r(`更新任务已创建，将跳过新鲜缓存并补齐缺失瓦片`),n(),ut(o,t,300);return}if(s===`toggle-details`){o.expandedTaskIds.has(c)?o.expandedTaskIds.delete(c):o.expandedTaskIds.add(c),n();return}s===`preview`&&l&&(window.location.href=xt(l))}catch(e){r(``,e.message),n(),ut(o,t,300)}}async function gt(e){return e.AMap?e.AMap:(window._AMapSecurityConfig={securityJsCode:p.securityJsCode},e.amapLoader?(e.AMap=await e.amapLoader.load({key:p.key,version:`2.0`,plugins:p.plugins}).catch(e=>(console.warn(`高德 JSAPI 加载失败，后台地点搜索不可用`,e),null)),e.AMap):(console.warn(`高德 JSAPI Loader 未初始化，后台地点搜索不可用`),null))}function _t(e){let t=e.root.querySelector(`[data-precache-form]`);return{west:Number(t?.elements.west.value),south:Number(t?.elements.south.value),east:Number(t?.elements.east.value),north:Number(t?.elements.north.value)}}function vt(e,t){let n=e.root.querySelector(`[data-precache-form]`);n&&(n.elements.west.value=t.getWest().toFixed(6),n.elements.south.value=t.getSouth().toFixed(6),n.elements.east.value=t.getEast().toFixed(6),n.elements.north.value=t.getNorth().toFixed(6),bt(e,n))}function yt(e){if(!e.map||!e.rectangle)return;let t=e.map.getBounds();e.rectangle.setBounds(t),vt(e,t)}function bt(e,t){return t?(e.precacheForm={providerId:t.elements.providerId.value,bounds:{west:Number(t.elements.west.value),south:Number(t.elements.south.value),east:Number(t.elements.east.value),north:Number(t.elements.north.value)},minZoom:Number(t.elements.minZoom.value),maxZoom:Number(t.elements.maxZoom.value),concurrency:Number(t.elements.concurrency.value),requestIntervalMs:Number(t.elements.requestIntervalMs.value),refresh:t.elements.refresh.checked},e.precacheForm):null}function xt(e){let t=e.bounds||{},n=(Number(t.south)+Number(t.north))/2,r=(Number(t.west)+Number(t.east))/2,i=Number(e.maxZoom||e.minZoom||m.zoom);if(!Number.isFinite(n)||!Number.isFinite(r))return`/`;let a=[n.toFixed(6),r.toFixed(6),Math.max(3,Math.min(20,i)),0].join(`,`);return`/?coords=${encodeURIComponent(a)}`}function St(e,t){if(!t)return;let n=t.bounds||{};e.precacheForm={providerId:t.providerId||e.precacheForm?.providerId||``,bounds:{west:Number(n.west),south:Number(n.south),east:Number(n.east),north:Number(n.north)},minZoom:Number(t.minZoom),maxZoom:Number(t.maxZoom),concurrency:Number(t.concurrency||e.precacheForm?.concurrency||4),requestIntervalMs:Number(t.requestIntervalMs||e.precacheForm?.requestIntervalMs||0),refresh:!1}}function Ct(e,t,n,r=15){e.map&&(e.map.setView([n,t],r),yt(e),e.onPrecacheBoundsChange instanceof Function&&e.onPrecacheBoundsChange())}function wt(e,t){ut(e,t);let n=e.root.querySelector(`#admin-precache-map`);if(!n)return;e.precacheMapHeight&&(n.style.height=`${e.precacheMapHeight}px`),e.onPrecacheBoundsChange=()=>N(e,t),document.querySelectorAll(`.amap-sug-result`).forEach(e=>e.remove()),e.map&&(e.map.remove(),e.map=null,e.rectangle=null);let r=f.default.map(n,{center:m.center,zoom:Math.min(m.zoom,13),zoomControl:!0,attributionControl:!1});f.default.tileLayer(De(ee,`https://webst01.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}`),{minZoom:3,maxZoom:18,keepBuffer:4}).addTo(r);let i=_t(e),a=f.default.latLngBounds([i.south,i.west],[i.north,i.east]);e.rectangle=f.default.rectangle(a,{color:`#0f766e`,weight:2,fillColor:`#f59e0b`,fillOpacity:.14}).addTo(r);let o=!1;r.fitBounds(a),r.on(`moveend zoomend`,()=>yt(e)),r.on(`moveend zoomend`,()=>{o&&e.onPrecacheBoundsChange instanceof Function&&e.onPrecacheBoundsChange()}),window.requestAnimationFrame(()=>{o=!0}),e.map=r;let s=e.root.querySelector(`[data-place-search-form] input[name="keyword"]`);s&&(s.id=`admin-precache-search-input`,gt(e).then(t=>{t&&t.AutoComplete&&new t.AutoComplete({input:`admin-precache-search-input`}).on(`select`,t=>{if(t.poi?.location){let{lng:n,lat:r}=t.poi.location;Ct(e,n,r)}})}));let c=e.root.querySelector(`.admin-map-resizer`);if(c&&n){let t=0,r=0,i=e=>{t=e.clientY,r=n.offsetHeight,document.addEventListener(`pointermove`,a),document.addEventListener(`pointerup`,o),c.classList.add(`is-dragging`),e.preventDefault()},a=i=>{let a=i.clientY-t,o=Math.min(800,Math.max(150,r+a));n.style.height=`${o}px`,e.precacheMapHeight=o,e.map&&e.map.invalidateSize()},o=()=>{document.removeEventListener(`pointermove`,a),document.removeEventListener(`pointerup`,o),c.classList.remove(`is-dragging`)};c.addEventListener(`pointerdown`,i)}}async function Tt(e,t){let n=e.root.querySelector(`[data-place-search-results]`);if(!n)return;let r=await gt(e);if(!r){n.innerHTML=`<p>高德搜索暂不可用</p>`;return}let i=new r.PlaceSearch({pageSize:8,pageIndex:1});n.innerHTML=`<p>正在搜索</p>`,i.search(t,(e,t)=>{if(e!==`complete`||!t?.poiList?.pois?.length){n.innerHTML=`<p>没有找到匹配地点</p>`;return}n.innerHTML=t.poiList.pois.map(e=>{let t=e.location;return`
        <button type="button" data-place-lng="${t.lng}" data-place-lat="${t.lat}">
          <strong>${j(e.name)}</strong>
          <span>${j(e.address||e.district||``)}</span>
        </button>
      `}).join(``)})}var Et=4;function P(e){let t=e.settings?.access||{};return`
    <div class="admin-grid">
      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>访问控制</h2>
          <span class="admin-badge">${t.enabled?`ON`:`OFF`}</span>
        </div>
        <form class="admin-form" data-access-form autocomplete="off">
          <label class="admin-check">
            <input type="checkbox" name="accessEnabled" ${t.enabled?`checked`:``}>
            <span>启用访问密码</span>
          </label>
          <label>
            <span>设置访问密码</span>
            <input name="accessPassword" type="password" autocomplete="new-password" placeholder="${t.hasPassword?`已设置，输入新密码以修改`:`输入至少 ${Et} 位访问密码`}">
          </label>
          ${t.hasPassword?`
            <label class="admin-check">
              <input type="checkbox" name="clearAccessPassword">
              <span>清除已保存的访问密码</span>
            </label>
          `:``}
          <button type="submit">保存访问控制</button>
        </form>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>修改管理密码</h2>
        </div>
        <form class="admin-form" data-admin-password-form autocomplete="off">
          <label>
            <span>当前密码</span>
            <input name="currentPassword" type="password" required autocomplete="current-password" placeholder="请输入当前密码">
          </label>
          <label>
            <span>新密码</span>
            <input name="newPassword" type="password" required autocomplete="new-password" placeholder="请输入新密码（至少4位）">
          </label>
          <label>
            <span>确认新密码</span>
            <input name="confirmPassword" type="password" required autocomplete="new-password" placeholder="请再次输入新密码">
          </label>
          <button type="submit">修改密码</button>
        </form>
      </section>
    </div>
  `}async function F({api:e,event:t,renderDashboard:n,setNotice:r,state:i}){let a=t.target.closest(`[data-access-form]`),o=t.target.closest(`[data-admin-password-form]`);if(a){t.preventDefault();try{let t=a.elements.accessEnabled.checked,o=a.elements.accessPassword.value.trim(),s=a.elements.clearAccessPassword?.checked||!1,c={access:{enabled:t}};if(o){if(o.length<Et)return r(``,`访问密码长度至少为 ${Et} 位`),n(),!0;c.access.password=o}else if(s)c.access.clearPassword=!0;else if(t&&!i.settings?.access?.hasPassword)return r(``,`启用访问密码时，必须设置访问密码`),n(),!0;if(t&&s&&!o)return r(``,`启用访问密码时不能同时清除密码`),n(),!0;i.settings=await e.updateSettings(c),r(`访问控制已保存`),n()}catch(e){r(``,e.message),n()}return!0}if(o){t.preventDefault();let i=o.elements.currentPassword.value,a=o.elements.newPassword.value,s=o.elements.confirmPassword.value;if(a.length<4)return r(``,`新密码长度至少为 4 位`),n(),!0;if(a!==s)return r(``,`两次输入的新密码不一致`),n(),!0;try{await e.updatePassword({currentPassword:i,newPassword:a}),r(`管理密码修改成功！`),o.reset(),n()}catch(e){r(``,e.message),n()}return!0}return!1}function Dt(e){let t=new DOMParser().parseFromString(e,`text/xml`);if(t.querySelector(`parsererror`))throw Error(`KML 文件解析失败，可能格式不正确`);let n=t.getElementsByTagName(`Placemark`),r=[];for(let e=0;e<n.length;e++){let t=n[e],i=t.getElementsByTagName(`name`)[0],a=t.getElementsByTagName(`description`)[0],o=i?i.textContent.trim():`未命名要素 ${e+1}`,s=a?a.textContent.trim():``,c=null,l=null,u=t.getElementsByTagName(`Point`)[0],d=t.getElementsByTagName(`LineString`)[0],f=t.getElementsByTagName(`Polygon`)[0];u?(c=`Point`,l=Ot(u.getElementsByTagName(`coordinates`)[0]?.textContent||``)[0]):d?(c=`LineString`,l=Ot(d.getElementsByTagName(`coordinates`)[0]?.textContent||``)):f&&(c=`Polygon`,l=Ot(f.getElementsByTagName(`outerBoundaryIs`)[0]?.getElementsByTagName(`coordinates`)[0]?.textContent||``)),c&&l&&r.push({id:`feat-${Date.now()}-${Math.random().toString(16).slice(2,8)}`,type:c,name:o,description:s,coordinates:l})}return r}function Ot(e){return e.trim().split(/\s+/).map(e=>{let t=e.split(`,`).map(Number);return[t[0],t[1]]}).filter(e=>!isNaN(e[0])&&!isNaN(e[1]))}function kt(e,t){let n=e=>String(e??``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&apos;`),r=[];r.push(`<?xml version="1.0" encoding="UTF-8"?>`),r.push(`<kml xmlns="http://www.opengis.net/kml/2.2">`),r.push(`  <Document>`),r.push(`    <name>${n(e)}</name>`);for(let e of t){if(r.push(`    <Placemark>`),r.push(`      <name>${n(e.name)}</name>`),r.push(`      <description>${n(e.description)}</description>`),e.type===`Point`)r.push(`      <Point>`),r.push(`        <coordinates>${e.coordinates[0]},${e.coordinates[1]},0</coordinates>`),r.push(`      </Point>`);else if(e.type===`LineString`){r.push(`      <LineString>`);let t=e.coordinates.map(e=>`${e[0]},${e[1]},0`).join(` `);r.push(`        <coordinates>${t}</coordinates>`),r.push(`      </LineString>`)}else if(e.type===`Polygon`){r.push(`      <Polygon>`),r.push(`        <outerBoundaryIs>`),r.push(`          <LinearRing>`);let t=[...e.coordinates],n=t[0],i=t[t.length-1];n&&i&&(n[0]!==i[0]||n[1]!==i[1])&&t.push(n);let a=t.map(e=>`${e[0]},${e[1]},0`).join(` `);r.push(`            <coordinates>${a}</coordinates>`),r.push(`          </LinearRing>`),r.push(`        </outerBoundaryIs>`),r.push(`      </Polygon>`)}r.push(`    </Placemark>`)}return r.push(`  </Document>`),r.push(`</kml>`),r.join(`
`)}function At(e){let t=e.kmls||[];return`
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>公共 KML 图层管理</h2>
        <span class="admin-badge">${t.length}</span>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-primary" data-admin-action="create-blank-kml">新建空白 KML</button>
          <button type="button" class="btn-primary" data-admin-action="trigger-import">导入 KML 文件</button>
          <input type="file" id="admin-kml-file-input" accept=".kml" style="display: none;">
        </div>
      </div>
      <div class="admin-table-container" style="overflow-x: auto; margin-top: 16px;">
        <table class="admin-table" style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
          <thead>
            <tr style="border-bottom: 2px solid #e2e8f0; color: #4a5568; font-weight: 600;">
              <th style="padding: 10px 8px;">图层名称</th>
              <th style="padding: 10px 8px;">要素数量</th>
              <th style="padding: 10px 8px;">坐标纠偏</th>
              <th style="padding: 10px 8px;">状态</th>
              <th style="padding: 10px 8px;">最后更新时间</th>
              <th style="padding: 10px 8px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            ${t.map(e=>{let t=`草稿`,n=`background: #f3f4f6; color: #4b5563;`;e.status===`published`?(t=`已发布`,n=`background: #dcfce7; color: #15803d;`):e.status===`disabled`&&(t=`已禁用`,n=`background: #ffedd5; color: #c2410c;`);let r=e.updatedAt?new Date(e.updatedAt).toLocaleString():`-`;return`
                <tr style="border-bottom: 1px solid #e2e8f0; height: 48px;">
                  <td style="padding: 10px 8px; font-weight: 500; color: #1a202c;">${j(e.name)}</td>
                  <td style="padding: 10px 8px; color: #4a5568;">${e.features?e.features.length:e.featureCount||0}</td>
                  <td style="padding: 10px 8px; color: #4a5568;">
                    <label style="display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                      <input type="checkbox" data-admin-action="toggle-correction" data-kml-id="${e.id}" ${e.coordCorrection===`none`?``:`checked`}>
                      <span>纠偏</span>
                    </label>
                  </td>
                  <td style="padding: 10px 8px;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; ${n}">
                      ${t}
                    </span>
                  </td>
                  <td style="padding: 10px 8px; color: #718096;">${j(r)}</td>
                  <td style="padding: 10px 8px; text-align: right;">
                    <div style="display: inline-flex; gap: 6px;">
                      ${e.status===`published`?`
                        <button type="button" class="btn-xs" style="background: #ed8936; color: white;" data-admin-action="set-status" data-kml-id="${e.id}" data-kml-status="disabled">禁用</button>
                      `:`
                        <button type="button" class="btn-xs" style="background: #48bb78; color: white;" data-admin-action="set-status" data-kml-id="${e.id}" data-kml-status="published">发布</button>
                      `}
                      <button type="button" class="btn-xs" data-admin-action="rename" data-kml-id="${e.id}" data-kml-name="${j(e.name)}">重命名</button>
                      <a class="btn-xs-link" href="/?editPublicKml=${e.id}" style="text-decoration: none; padding: 4px 8px; background: #3182ce; color: white; border-radius: 4px; display: inline-block; font-size: 11px; font-weight: 500;" target="_blank">编辑数据</a>
                      <button type="button" class="btn-xs" data-admin-action="export" data-kml-id="${e.id}">导出</button>
                      <button type="button" class="btn-xs btn-danger" style="padding: 4px 8px; font-size: 11px;" data-admin-action="delete" data-kml-id="${e.id}">删除</button>
                    </div>
                  </td>
                </tr>
              `}).join(``)||`<tr><td colspan="6" style="padding: 24px; text-align: center; color: #a0aec0;">暂无公共 KML 图层</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `}async function I({api:e,event:t,renderDashboard:n,setNotice:r,showConfirm:i,state:a}){let o=t.target.closest(`[data-admin-action]`);if(!o)return!1;let s=o.getAttribute(`data-admin-action`),c=o.getAttribute(`data-kml-id`);if(s===`create-blank-kml`){let t=await he({title:`新建公共 KML`,fields:[{name:`name`,label:`图层名称`,type:`text`}],values:{name:`新建公共 KML ${a.kmls.length+1}`}});if(!t||!t.name?.trim())return!0;try{r(`正在创建...`),await e.createKml({name:t.name.trim(),status:`draft`,coordCorrection:`wgs84-to-gcj02`,features:[]}),a.kmls=await e.kmls(),r(`新建成功`),n()}catch(e){r(``,e.message),n()}return!0}if(s===`trigger-import`)return document.getElementById(`admin-kml-file-input`)?.click(),!0;if(s===`set-status`){let t=o.getAttribute(`data-kml-status`);try{r(`正在更新状态...`),await e.updateKml(c,{status:t}),a.kmls=await e.kmls(),r(`状态已更新`),n()}catch(e){r(``,e.message),n()}return!0}if(s===`rename`){let t=o.getAttribute(`data-kml-name`),i=await he({title:`重命名公共 KML`,fields:[{name:`name`,label:`图层名称`,type:`text`}],values:{name:t}});if(!i||!i.name?.trim()||i.name.trim()===t)return!0;try{r(`正在重命名...`),await e.updateKml(c,{name:i.name.trim()}),a.kmls=await e.kmls(),r(`重命名成功`),n()}catch(e){r(``,e.message),n()}return!0}if(s===`export`){try{r(`正在获取数据...`);let t=await e.getKml(c);r(``);let n=kt(t.name,t.features||[]),i=new Blob([n],{type:`application/vnd.google-earth.kml+xml;charset=utf-8`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=`${t.name}.kml`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a)}catch(e){r(``,e.message),n()}return!0}if(s===`delete`){if(!await i(`确认永久删除此公共 KML 图层及其中所有要素？此操作不可撤销。`))return!0;try{r(`正在删除...`),await e.deleteKml(c),a.kmls=await e.kmls(),r(`删除成功`),n()}catch(e){r(``,e.message),n()}return!0}return!1}async function R({api:e,event:t,renderDashboard:n,setNotice:r,state:i}){let a=t.target;if(a.id===`admin-kml-file-input`){let t=a.files[0];if(!t)return!0;let o=new FormData;o.append(`file`,t),o.append(`name`,t.name),o.append(`status`,`draft`),o.append(`coordCorrection`,`wgs84-to-gcj02`);try{r(`正在导入 KML 文件...`),await e.importKml(o),i.kmls=await e.kmls(),r(`导入成功（默认为草稿状态）`),n()}catch(e){r(``,e.message),n()}finally{a.value=``}return!0}if(a.matches(`[data-admin-action="toggle-correction"]`)){let t=a.getAttribute(`data-kml-id`),o=a.checked?`wgs84-to-gcj02`:`none`;try{r(`正在更新纠偏设置...`),await e.updateKml(t,{coordCorrection:o}),i.kmls=await e.kmls(),r(`纠偏设置已更新`),n()}catch(e){r(``,e.message),n()}return!0}return!1}var jt=216e5,Mt=2592e6,z=60*1e3,Nt=60*z,Pt=24*Nt,Ft={1:256,2:512,3:768},B=[[`xyz`,`XYZ 栅格`],[`tms`,`TMS 栅格`],[`xyz-raster`,`XYZ 栅格`],[`tms-raster`,`TMS 栅格`],[`wmts-raster`,`WMTS 栅格`],[`arcgis-raster`,`ArcGIS 栅格`],[`quadkey-raster`,`QuadKey 栅格`],[`time-raster`,`时间序列栅格`],[`mvt`,`MVT 矢量瓦片`],[`vector-tilejson`,`矢量 TileJSON`],[`vector-style`,`矢量 Style JSON`],[`pmtiles-vector`,`PMTiles 矢量`],[`pmtiles-raster`,`PMTiles 栅格`],[`google-map-tiles-api`,`Google Map Tiles API`]],It=[[`satellite`,`卫星`],[`road`,`街道/道路`],[`street`,`街道/道路`],[`label`,`注记`],[`terrain`,`地形`],[`vector`,`矢量`],[`overlay`,`叠加`],[`weather`,`天气`],[`other`,`其他`],[`custom`,`自定义`]],Lt=[[`query`,`Query 参数`],[`header`,`请求头`],[`bearer`,`Bearer Token`],[`session`,`会话/适配器`]],Rt=[[`round_robin`,`健康 Key 轮询`],[`priority_failover`,`优先级失败切换`],[`random`,`健康 Key 随机`],[`weighted_round_robin`,`按权重轮询`]],zt=[[`global`,`全局`],[`source`,`图源`],[`publish`,`发布项`]],Bt=[[`leaflet`,`Leaflet 栅格`],[`maplibre`,`MapLibre 矢量`],[`cesium`,`Cesium 3D`]],Vt=new Set([`mvt`,`vector-tilejson`,`vector-style`,`pmtiles-vector`]),Ht=new Set([`pmtiles-vector`,`pmtiles-raster`]);function Ut(e){return e?.errorMessage||e?.error||``}function V(e,t=``){return e.map(([e,n])=>`<option value="${j(e)}" ${t===e?`selected`:``}>${j(n)}</option>`).join(``)}function Wt(e,t){return!e||t.some(([t])=>t===e)?``:`<option value="${j(e)}" selected>${j(e)}</option>`}function Gt(e=``){return B.find(([t])=>t===e)?.[1]||e||`-`}function Kt(e=``){return Vt.has(e)}function qt(e=``){return Ht.has(e)}function Jt(e={},t){return e.entry?.[t]||e[t]||``}function H(e={}){return e.kind===`vector-style`?Jt(e,`styleJsonUrl`):e.kind===`vector-tilejson`?Jt(e,`tileJsonUrl`):qt(e.kind)?Jt(e,`pmtilesUrl`):Jt(e,`template`)}function U(e,t=`是`,n=`否`){return e?`<span class="badge-green">${j(t)}</span>`:`<span class="badge-gray">${j(n)}</span>`}function W(e=`ready`){return e===`ready`?`<span class="badge-green">可创建</span>`:e===`requires_adapter`?`<span class="badge-blue">需适配器</span>`:e===`research_only`?`<span class="badge-gray">调研参考</span>`:`<span class="badge-gray">${j(e)}</span>`}function Yt(e=[],t=``){return e.map(e=>`<option value="${j(e.id)}" ${e.id===t?`selected`:``}>${j(e.name)} (${j(e.id)})</option>`).join(``)}function Xt(e={},t=[]){return e.requiresKey&&(t.find(t=>(t.allowedPresetIds||[]).includes(e.presetId))||t.find(t=>t.id===`default-${e.vendor}-key-pool`)||t.find(t=>t.vendor===e.vendor&&t.scope===`global`))||null}function Zt(e={},t=`申请 Key`){return e.credentialUrl?`<a href="${j(e.credentialUrl)}" target="_blank" rel="noopener noreferrer" class="btn-link">${j(t)}</a>`:``}function Qt(e){return e===`layer`?`组合图层`:e===`dedicated_source`?`专用图源`:`系统图源`}function $t(e){return e.visibility?.scope===`external_only`?`专用发布`:`系统图源`}function en(e,t){let n=window.location.origin,r=e.pathSlug,i=e.auth?.mode===`token`?`?token=您的TOKEN`:``,a=`${n}/api/v1/external/${r}/tilejson${i}`,o=`${n}/api/v1/external/${r}/tilejson.json${i}`,s=`${n}/api/v1/external/${r}/style.json${i}`,c=e.targetType===`source`||e.targetType===`dedicated_source`?(t.tileSources||[]).find(t=>t.id===e.targetId):null;if(c&&Kt(c.kind)){let t=`${n}/api/v1/external/${r}/tiles/{z}/{x}/{y}.pbf${i}`,a=`${n}/api/v1/external/${r}.pmtiles${i}`,l=c.kind===`vector-style`?s:c.kind===`vector-tilejson`?o:qt(c.kind)?a:t,u=c.kind===`vector-style`?`const map = new maplibregl.Map({
  container: 'map',
  style: '${s}'
});`:c.kind===`vector-tilejson`?`const style = {
  version: 8,
  sources: {
    tiles: { type: 'vector', url: '${o}' }
  },
  layers: []
};`:`// MVT/PMTiles 需要结合具体 source-layer 或 style 定义使用
// 资源入口: ${l}`;return`
      <div class="form-card" style="margin-top:25px; background:white;">
        <h4>矢量对外接入 URL 示例 : <strong>${j(e.name)}</strong></h4>
        <div style="margin-top:10px; font-size:12px;">
          <div><strong>主入口 URL:</strong></div>
          <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${j(l)}</code>
          <div style="margin-top:10px;"><strong>Style JSON:</strong></div>
          <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${j(s)}</code>
          <div style="margin-top:10px;"><strong>TileJSON:</strong></div>
          <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${j(o)}</code>
        </div>
        <div style="margin-top:20px;">
          <strong>MapLibre 加载接入示例:</strong>
          <div class="api-example">${j(u)}</div>
        </div>
      </div>
    `}if(e.targetType===`layer`){let o=(t.mapLayers||[]).find(t=>t.id===e.targetId),s=(o?.items||[]).map(e=>({...e,url:`${n}/api/v1/external/${r}/sources/${e.sourceId}/{z}/{x}/{y}${i}`})),c=s.length?s.map(e=>`L.tileLayer('${e.url}', {
  minZoom: ${o?.minZoom??3},
  maxZoom: ${o?.maxZoom??18},
  opacity: ${e.opacity??1},
  attribution: '私有地图服务中心'
}).addTo(map);`).join(`

`):`// 当前组合图层没有可用图源`;return`
      <div class="form-card" style="margin-top:25px; background:white;">
        <h4>对外接入 URL 示例 : <strong>${j(e.name)}</strong></h4>
        <div style="margin-top:10px; font-size:12px;">
          <div><strong>TileJSON 契约接口 URL:</strong></div>
          <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${j(a)}</code>
          <div style="margin-top:10px;"><strong>组合图层图源瓦片地址:</strong></div>
          ${s.map(e=>`<code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${j(e.url)}</code>`).join(``)||`<p style="color:#64748b;">暂无可用图源地址</p>`}
        </div>

        <div style="margin-top:20px;">
          <strong>Leaflet 加载接入示例:</strong>
          <div class="api-example">${j(c)}</div>
        </div>
      </div>
    `}let l=`${n}/api/v1/external/${r}/{z}/{x}/{y}${i}`;return`
    <div class="form-card" style="margin-top:25px; background:white;">
      <h4>对外接入 URL 示例 : <strong>${j(e.name)}</strong></h4>
      <div style="margin-top:10px; font-size:12px;">
        <div><strong>TileJSON 契约接口 URL:</strong></div>
        <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${j(a)}</code>
        
        <div style="margin-top:10px;"><strong>标准 XYZ 瓦片服务地址:</strong></div>
        <code style="background:#f1f5f9; padding:4px 8px; display:block; border-radius:4px; margin:4px 0; word-break:break-all;">${j(l)}</code>
      </div>

      <div style="margin-top:20px;">
        <strong>Leaflet 加载接入示例:</strong>
        <div class="api-example">L.tileLayer('${j(l)}', {
  minZoom: 3,
  maxZoom: 18,
  attribution: '私有地图服务中心'
}).addTo(map);</div>
      </div>

      <div style="margin-top:15px;">
        <strong>QGIS 接入说明:</strong>
        <div style="font-size:12px; color:#475569; margin-top:4px;">
          在 QGIS 的 Browser 面板中右键选择 <strong>XYZ Tiles</strong> -> <strong>New Connection</strong>，填入名称并将瓦片地址设置为上方“XYZ瓦片服务地址”即可。
        </div>
      </div>
    </div>
  `}function tn(e={},t=[],n=[],r=`proxy`){let i=[`fixed`,`pool`].includes(e.mode)?e.mode:`never`;return`
    <div class="form-grid">
      <div class="field-group">
        <label>代理模式</label>
        <select name="${r}_mode" data-proxy-mode-select>
          <option value="never" ${i===`never`?`selected`:``}>始终直连</option>
          <option value="fixed" ${i===`fixed`?`selected`:``}>固定代理出口</option>
          <option value="pool" ${i===`pool`?`selected`:``}>代理出口池</option>
        </select>
      </div>
      <div class="field-group" data-proxy-outbound-field style="display: ${i===`fixed`?`flex`:`none`};">
        <label>关联代理出口</label>
        <select name="${r}_outboundId">
          <option value="">请选择出口</option>
          ${t.map(t=>`<option value="${t.id}" ${e.outboundId===t.id?`selected`:``}>${j(t.name)}</option>`).join(``)}
        </select>
      </div>
      <div class="field-group" data-proxy-pool-field style="display: ${i===`pool`?`flex`:`none`};">
        <label>关联代理池</label>
        <select name="${r}_poolId">
          <option value="">请选择代理池</option>
          ${n.map(t=>`<option value="${t.id}" ${e.poolId===t.id?`selected`:``}>${j(t.name)}</option>`).join(``)}
        </select>
      </div>
    </div>
    <div class="checkbox-group">
      <input type="checkbox" id="${r}_fallback" name="${r}_fallbackToDirect" ${e.fallbackToDirect?`checked`:``}>
      <label for="${r}_fallback">代理连接失败时允许直连</label>
    </div>
  `}function G(e,t){let n=Number.isFinite(Number(e))?Math.max(0,Number(e)):t;return{days:Math.floor(n/Pt),hours:Math.floor(n%Pt/Nt),minutes:Math.floor(n%Nt/z)}}function nn(e,t,n,r){let i=G(n,r);return`
    <div class="field-group">
      <label>${t}</label>
      <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:8px;">
        <input name="${e}_days" type="number" min="0" max="365" value="${i.days}" aria-label="${t}天数">
        <input name="${e}_hours" type="number" min="0" max="23" value="${i.hours}" aria-label="${t}小时数">
        <input name="${e}_minutes" type="number" min="0" max="59" value="${i.minutes}" aria-label="${t}分钟数">
      </div>
      <small style="color:#64748b;">天 / 小时 / 分钟</small>
    </div>
  `}function rn(e={},t=`cache`){return`
    <div class="checkbox-group">
      <input type="checkbox" id="${t}_enabled" name="${t}_enabled" ${e.enabled===!1?``:`checked`}>
      <label for="${t}_enabled">启用服务端缓存</label>
    </div>
    <div class="form-grid" style="margin-top:10px;">
      ${nn(`${t}_ttl`,`缓存有效时间`,e.ttlMs,jt)}
      ${nn(`${t}_staleTtl`,`软过期时间`,e.staleTtlMs,Mt)}
    </div>
  `}function an(e,t,n=`proxy`){return{mode:t.get(`${n}_mode`)||`never`,outboundId:t.get(`${n}_outboundId`)||``,poolId:t.get(`${n}_poolId`)||``,fallbackToDirect:!!e.elements[`${n}_fallbackToDirect`]?.checked}}function on(e,t){let n=Math.max(0,parseInt(e.get(`${t}_days`)||`0`,10)||0),r=Math.max(0,parseInt(e.get(`${t}_hours`)||`0`,10)||0),i=Math.max(0,parseInt(e.get(`${t}_minutes`)||`0`,10)||0);return n*Pt+r*Nt+i*z}function sn(e,t,n=`cache`){return{enabled:!!e.elements[`${n}_enabled`]?.checked,ttlMs:on(t,`${n}_ttl`),staleTtlMs:on(t,`${n}_staleTtl`)}}function cn(e,t){return String(e.get(t)||``).split(`,`).map(e=>e.trim()).filter(Boolean)}function ln(e){return{template:String(e.get(`entry_template`)||``).trim(),styleJsonUrl:String(e.get(`entry_styleJsonUrl`)||``).trim(),tileJsonUrl:String(e.get(`entry_tileJsonUrl`)||``).trim(),pmtilesUrl:String(e.get(`entry_pmtilesUrl`)||``).trim(),glyphsUrl:String(e.get(`entry_glyphsUrl`)||``).trim(),spritesUrl:String(e.get(`entry_spritesUrl`)||``).trim()}}function un(e,t){return{required:!!e.elements.secrets_required?.checked,keyPoolId:t.get(`secrets_keyPoolId`)||``,placement:t.get(`secrets_placement`)||`query`,paramName:t.get(`secrets_paramName`)||`key`}}function K(e,t){return{engine:t.get(`rendering_engine`)||`leaflet`,clients:[e.elements.rendering_client_2d?.checked?`2d`:``,e.elements.rendering_client_3d?.checked?`3d`:``].filter(Boolean),fallbackRasterSourceId:t.get(`rendering_fallbackRasterSourceId`)||``}}function dn(e,t){return{attribution:t.get(`license_attribution`)||``,termsUrl:t.get(`license_termsUrl`)||``,officialStatus:t.get(`license_officialStatus`)||`official`,licenseType:t.get(`license_licenseType`)||`unknown`,cacheAllowedByLicense:!!e.elements.license_cacheAllowedByLicense?.checked,publicUseAllowed:!!e.elements.license_publicUseAllowed?.checked,chinaPublicUseReviewed:!!e.elements.license_chinaPublicUseReviewed?.checked,chinaPublicUseRisk:t.get(`license_chinaPublicUseRisk`)||``}}function q(e,t){let n=Array.from(e.querySelectorAll(`[data-key-row]`)).map(e=>{let t=t=>e.querySelector(`[name="${t}"]`),n={id:t(`key_id`)?.value||``,alias:t(`key_alias`)?.value||``,enabled:!!t(`key_enabled`)?.checked,secretType:t(`key_secretType`)?.value||`api_key`,placement:t(`key_placement`)?.value||`query`,paramName:t(`key_paramName`)?.value||`key`,priority:parseInt(t(`key_priority`)?.value||`100`,10),weight:parseInt(t(`key_weight`)?.value||`1`,10),qpsLimit:parseInt(t(`key_qpsLimit`)?.value||`0`,10),dailyLimit:parseInt(t(`key_dailyLimit`)?.value||`0`,10),monthlyLimit:parseInt(t(`key_monthlyLimit`)?.value||`0`,10)},r=t(`key_secret`)?.value||``;return r&&(n.secret=r),n});return{id:t.get(`id`),name:t.get(`name`),vendor:t.get(`vendor`),enabled:!!e.elements.enabled?.checked,scope:t.get(`scope`)||`global`,strategy:t.get(`strategy`)||`round_robin`,cooldownMs:parseInt(t.get(`cooldownMs`)||`300000`,10),maxRetriesPerRequest:parseInt(t.get(`maxRetriesPerRequest`)||`2`,10),defaultSecretType:t.get(`defaultSecretType`)||`api_key`,defaultPlacement:t.get(`defaultPlacement`)||`query`,defaultParamName:t.get(`defaultParamName`)||`key`,credentialUrl:String(t.get(`credentialUrl`)||``).trim(),allowedPresetIds:cn(t,`allowedPresetIds`),allowedSourceIds:cn(t,`allowedSourceIds`),keys:n,description:t.get(`description`)||``}}function fn(e,t){if(!e.editingKeyPool||!t)return;let n=e.editingKeyPool.keys||[],r=new Map(n.filter(e=>e.id).map(e=>[e.id,e])),i=q(t,new FormData(t));i.keys=i.keys.map((e,t)=>({...n[t]||{},...r.get(e.id)||{},...e})),e.editingKeyPool={...e.editingKeyPool,...i}}function pn(e={}){let t=e.entry||{};return`
    <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
      <legend style="padding:0 5px; font-weight:600;">上游入口配置</legend>
      <div class="form-grid single">
        <div class="field-group">
          <label>瓦片 / MVT URL 模板</label>
          <input name="entry_template" value="${j(t.template||e.template||``)}" placeholder="https://example.com/{z}/{x}/{y}.png">
          <small style="color:#64748b;">适用于栅格、WMTS、ArcGIS、QuadKey、MVT 等模板类图源；支持 {s}、{x}、{y}、{z}、{scale}、{yTms}、{key}、{quadkey}。</small>
        </div>
      </div>
      <div class="form-grid">
        <div class="field-group">
          <label>Style JSON URL</label>
          <input name="entry_styleJsonUrl" value="${j(t.styleJsonUrl||e.styleJsonUrl||``)}" placeholder="https://example.com/style.json?key={key}">
        </div>
        <div class="field-group">
          <label>TileJSON URL</label>
          <input name="entry_tileJsonUrl" value="${j(t.tileJsonUrl||e.tileJsonUrl||``)}" placeholder="https://example.com/tilejson.json?key={key}">
        </div>
      </div>
      <div class="form-grid">
        <div class="field-group">
          <label>PMTiles URL</label>
          <input name="entry_pmtilesUrl" value="${j(t.pmtilesUrl||e.pmtilesUrl||``)}" placeholder="https://example.com/base.pmtiles">
        </div>
        <div class="field-group">
          <label>Glyphs URL</label>
          <input name="entry_glyphsUrl" value="${j(t.glyphsUrl||``)}" placeholder="https://example.com/fonts/{fontstack}/{range}.pbf">
        </div>
      </div>
      <div class="form-grid single">
        <div class="field-group">
          <label>Sprites URL 前缀</label>
          <input name="entry_spritesUrl" value="${j(t.spritesUrl||``)}" placeholder="https://example.com/sprites/sprite">
        </div>
      </div>
    </fieldset>
  `}function mn(e={},t=[]){let n=e.secrets||{};return`
    <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
      <legend style="padding:0 5px; font-weight:600;">密钥策略</legend>
      <div class="checkbox-group" style="margin-top:0;">
        <input type="checkbox" id="secrets_required" name="secrets_required" ${n.required?`checked`:``}>
        <label for="secrets_required">该图源需要密钥池</label>
      </div>
      <div class="form-grid" style="margin-top:10px;">
        <div class="field-group">
          <label>关联密钥池</label>
          <select name="secrets_keyPoolId">
            <option value="">不关联密钥池</option>
            ${Yt(t,n.keyPoolId||``)}
          </select>
        </div>
        <div class="field-group">
          <label>注入方式</label>
          <select name="secrets_placement">
            ${V(Lt,n.placement||`query`)}
          </select>
        </div>
      </div>
      <div class="form-grid single">
        <div class="field-group">
          <label>参数名 / Header 名</label>
          <input name="secrets_paramName" value="${j(n.paramName||`key`)}" placeholder="key / access_token / tk / x-api-key">
        </div>
      </div>
    </fieldset>
  `}function hn(e={},t=[]){let n=e.rendering||{},r=n.clients||(Kt(e.kind)?[`2d`]:[`2d`,`3d`]),i=t.filter(e=>!Kt(e.kind)&&!qt(e.kind));return`
    <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
      <legend style="padding:0 5px; font-weight:600;">渲染配置</legend>
      <div class="form-grid">
        <div class="field-group">
          <label>渲染引擎</label>
          <select name="rendering_engine">
            ${V(Bt,n.engine||(Kt(e.kind)?`maplibre`:`leaflet`))}
          </select>
        </div>
        <div class="field-group">
          <label>3D 降级栅格图源</label>
          <select name="rendering_fallbackRasterSourceId">
            <option value="">不配置</option>
            ${i.map(e=>`<option value="${j(e.id)}" ${n.fallbackRasterSourceId===e.id?`selected`:``}>${j(e.name)} (${j(e.id)})</option>`).join(``)}
          </select>
        </div>
      </div>
      <div class="checkbox-group" style="margin-top:0;">
        <input type="checkbox" id="rendering_client_2d" name="rendering_client_2d" ${r.includes(`2d`)?`checked`:``}>
        <label for="rendering_client_2d">支持 2D 前台</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="rendering_client_3d" name="rendering_client_3d" ${r.includes(`3d`)?`checked`:``}>
        <label for="rendering_client_3d">支持 3D 前台</label>
      </div>
    </fieldset>
  `}function gn(e={}){let t=e.license||{};return`
    <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
      <legend style="padding:0 5px; font-weight:600;">授权与合规</legend>
      <div class="form-grid">
        <div class="field-group">
          <label>版权声明</label>
          <input name="license_attribution" value="${j(t.attribution||e.attribution||``)}">
        </div>
        <div class="field-group">
          <label>服务条款 URL</label>
          <input name="license_termsUrl" value="${j(t.termsUrl||``)}">
        </div>
      </div>
      <div class="form-grid">
        <div class="field-group">
          <label>官方状态</label>
          <select name="license_officialStatus">
            ${V([[`official`,`官方`],[`unofficial`,`非官方`],[`community`,`社区`],[`internal`,`内部`]],t.officialStatus||`official`)}
          </select>
        </div>
        <div class="field-group">
          <label>授权类型</label>
          <select name="license_licenseType">
            ${V([[`free`,`免费`],[`api-key`,`API Key`],[`commercial`,`商业授权`],[`unknown`,`未知`]],t.licenseType||`unknown`)}
          </select>
        </div>
      </div>
      <div class="checkbox-group" style="margin-top:0;">
        <input type="checkbox" id="license_cacheAllowedByLicense" name="license_cacheAllowedByLicense" ${t.cacheAllowedByLicense===!1?``:`checked`}>
        <label for="license_cacheAllowedByLicense">授权允许服务端缓存</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="license_publicUseAllowed" name="license_publicUseAllowed" ${t.publicUseAllowed?`checked`:``}>
        <label for="license_publicUseAllowed">授权允许公开对外服务</label>
      </div>
      <div class="checkbox-group">
        <input type="checkbox" id="license_chinaPublicUseReviewed" name="license_chinaPublicUseReviewed" ${t.chinaPublicUseReviewed?`checked`:``}>
        <label for="license_chinaPublicUseReviewed">已完成国内公开使用风险复核</label>
      </div>
      <div class="field-group" style="margin-top:10px;">
        <label>国内公开使用风险说明</label>
        <textarea name="license_chinaPublicUseRisk" rows="2">${j(t.chinaPublicUseRisk||``)}</textarea>
      </div>
    </fieldset>
  `}function _n(e={}){let t=Number(e.retina?.normalValue);return Ft[t]?String(t):`1`}function vn(e,t,n,r,i){let a=e!==!1,o=a?i:r;return`
    <button
      type="button"
      class="status-toggle ${a?`is-enabled`:`is-disabled`}"
      data-tile-sources-toggle-${t}="${j(n)}"
      title="点击切换为${j(o)}"
    >${j(a?r:i)}</button>
  `}function yn(e){let t=String(e||``).toUpperCase();return t===`HIT`?`<span class="badge-green">HIT</span>`:t===`MISS`?`<span class="badge-red">MISS</span>`:t===`BYPASS`?`<span class="badge-gray">BYPASS</span>`:t===`REVALIDATED`?`<span class="badge-blue">REVAL</span>`:t===`STALE`?`<span class="badge-blue">STALE</span>`:t===`ERROR`?`<span class="badge-red">ERROR</span>`:`<span class="badge-gray">${j(t||`-`)}</span>`}function bn(e){let t=Number(e.statusCode||0);return t>=200&&t<300?`<span class="badge-green">200 OK</span>`:`<span class="badge-red" title="${j(e.errorMessage||``)}">${j(e.statusCode||`-`)}</span>`}function xn(e){return e.proxyOutboundId?`<span class="badge-blue" title="池: ${j(e.proxyPoolId||``)}">${j(e.proxyOutboundId)}</span>`:e.proxyPoolId?`<span class="badge-blue">${j(e.proxyPoolId)}</span>`:e.proxyConfigured?`<span class="badge-red" title="已配置代理，但本次未命中可用出口">代理未命中</span>`:`<span style="color:#94a3b8;">直连</span>`}async function J(e,t,n={}){let{tileSources:r=!1,sourcePresets:i=!1,keyPools:a=!1,mapLayers:o=!1,externalPublishes:s=!1,precacheCatalog:c=!0}=n,l=[],u=[];r&&(l.push(t.listTileSources()),u.push(t=>{e.tileSources=t})),i&&(l.push(t.listSourcePresets()),u.push(t=>{e.sourcePresets=t})),a&&(l.push(t.listKeyPools()),u.push(t=>{e.keyPools=t})),o&&(l.push(t.listMapLayers()),u.push(t=>{e.mapLayers=t})),s&&(l.push(t.listExternalPublishes()),u.push(t=>{e.externalPublishes=t})),c&&(l.push(t.precacheCatalog()),u.push(t=>{e.precacheCatalog=t})),(await Promise.all(l)).forEach((e,t)=>u[t](e))}function Sn(e){e.tileSourcesSubTab=e.tileSourcesSubTab||`sources`;let t=[{id:`sources`,label:`图源`},{id:`presets`,label:`图源预设`},{id:`key-pools`,label:`密钥池`},{id:`layers`,label:`图层组合`},{id:`publishes`,label:`发布/API`},{id:`diagnostics`,label:`诊断日志`}],n=``;switch(e.tileSourcesSubTab){case`sources`:n=Cn(e);break;case`presets`:n=wn(e);break;case`key-pools`:n=En(e);break;case`layers`:n=Dn(e);break;case`publishes`:n=On(e);break;case`diagnostics`:n=kn(e);break;default:n=`<p>未知子页面</p>`}return`
    <section class="admin-panel tile-sources-panel">


      <div class="subtab-header" role="tablist">
        ${t.map(t=>`
          <button class="subtab-btn ${e.tileSourcesSubTab===t.id?`is-active`:``}" 
                  type="button" role="tab" 
                  data-tile-sources-tab="${t.id}">
            ${j(t.label)}
          </button>
        `).join(``)}
      </div>

      <div class="subtab-content">
        ${n}
      </div>
    </section>
  `}function Cn(e){let t=e.tileSources||[],n=e.editingTileSource;if(n){let r=!t.some(e=>e.id===n.id),i=e.proxyOutbounds||[],a=e.proxyPools||[],o=e.keyPools||[],s=_n(n),c=n.category||`custom`,l=n.kind||`xyz-raster`;return`
      <div class="form-card">
        <h3>${r?`新增图源`:`编辑图源: ${j(n.id)}`}</h3>
        <form data-tile-sources-form="source">
          <input type="hidden" name="isNew" value="${r}">
          <div class="form-grid">
            <div class="field-group">
              <label>图源唯一 ID</label>
              <input name="id" value="${j(n.id||``)}" required ${r?``:`readonly`} placeholder="例如: custom-satellite">
            </div>
            <div class="field-group">
              <label>图源名称</label>
              <input name="name" value="${j(n.name||``)}" required placeholder="例如: 自定义卫星">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>地图提供商</label>
              <input name="vendor" value="${j(n.vendor||``)}" required placeholder="例如: amap, google, custom">
            </div>
            <div class="field-group">
              <label>图源分类</label>
              <select name="category">
                ${Wt(c,It)}
                ${V(It,c)}
              </select>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>图源类型</label>
              <select name="kind">
                ${V(B,l)}
              </select>
            </div>
            <div class="field-group">
              <label>适配器</label>
              <input name="adapter" value="${j(n.adapter||(Kt(l)?`maplibre-style`:`template`))}" placeholder="template / wmts-kvp / maplibre-style / pmtiles">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>来源预设 ID</label>
              <input name="presetId" value="${j(n.presetId||``)}" placeholder="例如: preset:maptiler-streets-vector">
            </div>
            <div class="field-group">
              <label>矢量 Schema / 坐标系</label>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <input name="schema" value="${j(n.schema||``)}" placeholder="openmaptiles">
                <input name="coordinateSystem" value="${j(n.coordinateSystem||`EPSG:3857`)}" placeholder="EPSG:3857">
              </div>
            </div>
          </div>
          ${pn(n)}
          <div class="form-grid">
            <div class="field-group">
              <label>缩放范围 (最小 - 最大)</label>
              <div style="display:flex; gap:10px; align-items:center;">
                <input name="minZoom" type="number" value="${n.minZoom??3}" min="0" max="22" style="flex:1;">
                <span>至</span>
                <input name="maxZoom" type="number" value="${n.maxZoom??18}" min="0" max="22" style="flex:1;">
              </div>
            </div>
            <div class="field-group">
              <label>最大原生缩放</label>
              <input name="maxNativeZoom" type="number" value="${n.maxNativeZoom??18}" min="0" max="22">
            </div>
          </div>
          
          <div class="form-grid">
            <div class="field-group">
              <label>子域名组 (半角逗号分隔)</label>
              <input name="subdomains" value="${j((n.subdomains||[]).join(`,`))}" placeholder="例如: 1,2,3,4">
            </div>
            <div class="field-group">
              <label>瓦片倍率</label>
              <select name="tileScale">
                <option value="1" ${s===`1`?`selected`:``}>1x（256px）</option>
                <option value="2" ${s===`2`?`selected`:``}>2x（请求 512px，网格 256px）</option>
                <option value="3" ${s===`3`?`selected`:``}>3x（请求 768px，网格 256px）</option>
              </select>
              <small style="color:#64748b;">瓦片网格固定 256px；高清请求通过 scale 控制。</small>
            </div>
          </div>

          <div class="form-grid">
            <div class="field-group">
              <label>标签 (半角逗号分隔)</label>
              <input name="tags" value="${j((n.tags||[]).join(`,`))}" placeholder="例如: china, satellite">
            </div>
            <div class="field-group">
              <label>描述</label>
              <textarea name="description" rows="2">${j(n.description||``)}</textarea>
            </div>
          </div>

          ${mn(n,o)}
          ${hn(n,t)}
          ${gn(n)}

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">缓存策略</legend>
            ${rn(n.cache,`cache`)}
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">代理策略</legend>
            ${tn(n.proxy,i,a,`proxy`)}
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">访问日志</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="source_access_log_enabled" name="accessLog_enabled" ${n.accessLog?.enabled===!1?``:`checked`}>
              <label for="source_access_log_enabled">记录通过代理或发生错误的图源访问</label>
            </div>
            <div class="field-group" style="margin-top:10px;">
              <label>最大历史日志保留行数</label>
              <input name="accessLog_maxLogCount" type="number" min="0" max="10000" value="${n.accessLog?.maxLogCount??500}">
            </div>
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">权限控制</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="perm_front" name="perm_frontendVisible" ${n.permissions?.frontendVisible===!1?``:`checked`}>
              <label for="perm_front">允许前台底图选择器显示</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="perm_precache" name="perm_precacheAllowed" ${n.permissions?.precacheAllowed===!1?``:`checked`}>
              <label for="perm_precache">允许创建预缓存任务</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="perm_external" name="perm_externalApiAllowed" ${n.permissions?.externalApiAllowed===!1?``:`checked`}>
              <label for="perm_external">允许作为外部 API 发布公开项</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="perm_user_ref" name="perm_userReferenceAllowed" ${n.permissions?.userReferenceAllowed?`checked`:``}>
              <label for="perm_user_ref">允许用户自定义图层引用</label>
            </div>
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">使用范围</legend>
            <div class="field-group">
              <label>图源范围</label>
              <select name="visibility_scope">
                <option value="system" ${n.visibility?.scope===`external_only`?``:`selected`}>系统图源</option>
                <option value="external_only" ${n.visibility?.scope===`external_only`?`selected`:``}>仅对外 API 专用</option>
              </select>
            </div>
          </fieldset>

          <div class="checkbox-group" style="margin-top:20px;">
            <input type="checkbox" id="source_enabled" name="enabled" ${n.enabled===!1?``:`checked`}>
            <label for="source_enabled" style="font-weight:600; color:#1e293b;">启用该图源</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存配置</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="source">取消</button>
          </div>
        </form>
      </div>
    `}return`
    <div class="admin-panel-head">
      <h3>系统图源列表</h3>
      <button type="button" data-tile-sources-add="source">+ 新建图源</button>
    </div>
    
    <table class="item-table">
      <thead>
        <tr>
          <th>ID / 图源名称</th>
          <th>厂商 / 类型</th>
          <th>主入口</th>
          <th>缩放级</th>
          <th>密钥池</th>
          <th>缓存状态</th>
          <th>代理策略</th>
          <th>前台可见</th>
          <th>状态</th>
          <th>测试诊断</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${t.map(t=>{let n=e[`test_source_${t.id}`]||``,r=H(t);return`
            <tr>
              <td>
                <strong>${j(t.name)}</strong>
                <div style="color: #64748b; font-size:11px; margin-top:2px;">${j(t.id)}</div>
              </td>
              <td>
                <span class="badge-gray">${j(t.vendor)}</span>
                <span class="badge-gray" style="margin-left:4px;">${j(t.category)}</span>
                <span class="badge-blue" style="margin-left:4px;">${j(Gt(t.kind))}</span>
                <span class="badge-gray" style="margin-left:4px;">${j($t(t))}</span>
              </td>
              <td>
                <code style="display:block; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${j(r)}">${j(r||`-`)}</code>
              </td>
              <td>${t.minZoom}-${t.maxZoom}</td>
              <td>
                ${t.secrets?.required?`<span class="badge-blue">需要 Key</span>`:`<span class="badge-gray">无需 Key</span>`}
                ${t.secrets?.keyPoolId?`<div style="margin-top:4px;"><span class="badge-gray">${j(t.secrets.keyPoolId)}</span></div>`:``}
              </td>
              <td>
                ${t.cache?.enabled===!1?`<span class="badge-gray">绕过</span>`:`<span class="badge-green">启用</span>`}
              </td>
              <td>
                ${t.proxy?.mode===`never`?`<span class="badge-gray">直连</span>`:``}
                ${t.proxy?.mode===`fixed`?`<span class="badge-blue" title="出口: ${j(t.proxy.outboundId)}">固定出口</span>`:``}
                ${t.proxy?.mode===`pool`?`<span class="badge-blue" title="池: ${j(t.proxy.poolId)}">代理池</span>`:``}
              </td>
              <td>
                ${t.permissions?.frontendVisible===!1?`<span class="badge-red">隐藏</span>`:`<span class="badge-green">可见</span>`}
              </td>
              <td>
                ${vn(t.enabled,`source`,t.id,`启用中`,`已禁用`)}
              </td>
              <td>
                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                  <button type="button" class="btn-link" data-tile-sources-test-source="${t.id}">测试</button>
                  ${n===`loading`?`<span class="test-status test-loading" style="margin-left: 0;">测试中...</span>`:``}
                  ${n&&n!==`loading`&&n.success?`<span class="test-status test-success" style="margin-left: 0;">通过 (${n.duration}ms)</span>`:``}
                  ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" style="margin-left: 0;" title="${j(Ut(n))}">失败</span>`:``}
                </div>
              </td>
              <td>
                <div class="flex-actions">
                  <button type="button" class="btn-link" data-tile-sources-edit-source="${t.id}">编辑</button>
                  <button type="button" class="btn-link btn-danger-link" data-tile-sources-delete-source="${t.id}">删除</button>
                </div>
              </td>
            </tr>
          `}).join(``)||`<tr><td colspan="11" style="text-align:center;">暂无图源配置</td></tr>`}
      </tbody>
    </table>
  `}function wn(e){let t=e.sourcePresets||[],n=e.keyPools||[],r=e.creatingSourceFromPreset;if(r){let e=t.find(e=>e.presetId===r.presetId)||r,i=Xt(e,n),a=r.keyPoolId||i?.id||``,o=e.status===`ready`;return`
      <div class="form-card">
        <h3>基于预设创建图源: ${j(e.name||e.presetId)}</h3>
        <form data-tile-sources-form="preset-source">
          <input type="hidden" name="presetId" value="${j(e.presetId)}">
          <div class="form-grid">
            <div class="field-group">
              <label>新图源 ID</label>
              <input name="id" required value="${j(r.id||String(e.presetId||``).replace(/^preset:/,``))}">
            </div>
            <div class="field-group">
              <label>图源名称</label>
              <input name="name" required value="${j(r.name||e.name||``)}">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>预设类型</label>
              <input value="${j(`${e.vendor||`custom`} / ${Gt(e.kind)}`)}" readonly>
            </div>
            <div class="field-group">
              <label>关联密钥池</label>
              <select name="keyPoolId">
                <option value="">${e.requiresKey?`稍后配置密钥池`:`无需密钥池`}</option>
                ${Yt(n,a)}
              </select>
              ${i?`<p style="color:#64748b; font-size:12px; margin:6px 0 0;">已自动匹配：${j(i.name)} ${Zt(i)}</p>`:``}
            </div>
          </div>
          <div class="checkbox-group" style="margin-top:15px;">
            <input type="checkbox" id="preset_source_enabled" name="enabled" ${r.enabled&&o?`checked`:``} ${o?``:`disabled`}>
            <label for="preset_source_enabled" style="font-weight:600;">创建后立即启用</label>
          </div>
          ${o?``:`<p style="color:#64748b; font-size:12px; margin-top:8px;">该预设仍需适配器或仅供调研参考，只能先创建为禁用图源。</p>`}
          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">默认权限</legend>
            <div class="checkbox-group" style="margin-top:0;">
              <input type="checkbox" id="preset_perm_front" name="perm_frontendVisible" ${r.permissions?.frontendVisible?`checked`:``}>
              <label for="preset_perm_front">允许前台底图选择器显示</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="preset_perm_external" name="perm_externalApiAllowed" ${r.permissions?.externalApiAllowed?`checked`:``}>
              <label for="preset_perm_external">允许对外 API 发布</label>
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="preset_perm_user" name="perm_userReferenceAllowed" ${r.permissions?.userReferenceAllowed?`checked`:``}>
              <label for="preset_perm_user">允许用户自定义图层引用</label>
            </div>
          </fieldset>
          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">创建图源</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="preset-source">取消</button>
          </div>
        </form>
      </div>
    `}return`
    <div class="admin-panel-head">
      <h3>图源预设库</h3>
      <span style="color:#64748b; font-size:13px;">共 ${t.length} 个预设，创建后默认进入禁用态</span>
    </div>
    <table class="item-table">
      <thead>
        <tr>
          <th>预设名称 / ID</th>
          <th>厂商 / 类型</th>
          <th>Key</th>
          <th>状态</th>
          <th>授权提示</th>
          <th>入口摘要</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${t.map(e=>{let t=H(e),r=Xt(e,n);return`
            <tr>
              <td>
                <strong>${j(e.name)}</strong>
                <div style="color:#64748b; font-size:11px; margin-top:2px;">${j(e.presetId)}</div>
              </td>
              <td>
                <span class="badge-gray">${j(e.vendor)}</span>
                <span class="badge-blue" style="margin-left:4px;">${j(Gt(e.kind))}</span>
                <span class="badge-gray" style="margin-left:4px;">${j(e.category)}</span>
              </td>
              <td>
                ${e.requiresKey?`<span class="badge-blue">需要 Key</span>`:`<span class="badge-gray">无需 Key</span>`}
                ${(e.requiredSecretTypes||[]).map(e=>`<span class="badge-gray" style="margin-left:4px;">${j(e)}</span>`).join(``)}
                ${r?`<div style="margin-top:4px;"><span class="badge-gray">${j(r.name)}</span> ${Zt(r)}</div>`:``}
              </td>
              <td>${W(e.status)}</td>
              <td>
                ${U(e.cacheAllowedByLicense!==!1,`可缓存`,`禁缓存`)}
                ${U(!!e.publicUseAllowed,`可公开`,`慎公开`)}
              </td>
              <td>
                <code style="display:block; max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${j(t)}">${j(t||`-`)}</code>
              </td>
              <td>
                <button type="button" class="btn-link" data-tile-sources-create-from-preset="${j(e.presetId)}">创建图源</button>
              </td>
            </tr>
          `}).join(``)||`<tr><td colspan="7" style="text-align:center; color:#64748b; padding:20px;">暂无预设图源</td></tr>`}
      </tbody>
    </table>
  `}function Tn(e,t=!1,n={}){return(e.keys||[]).map((r,i)=>{let a=n[`test_key_${e.id}_${r.id}`]||``,o=!r.hasSecret&&!r.maskedPreview,s=r.secretType||e.defaultSecretType||`api_key`,c=r.placement||e.defaultPlacement||`query`,l=r.paramName||e.defaultParamName||`key`;return`
      <div class="key-row" data-key-row="${i}">
        <div class="key-row-main">
          <label style="display:inline-flex; align-items:center; gap:6px; font-weight:500;">
            <input type="checkbox" name="key_enabled" ${r.enabled===!1?``:`checked`}>
            启用
          </label>
          <input name="key_id" required value="${j(r.id||``)}" placeholder="key-a">
          <input name="key_alias" value="${j(r.alias||``)}" placeholder="主 Key">
          <select name="key_secretType">
            ${Wt(s,[[`api_key`,`api_key`],[`token`,`token`],[`tk`,`tk`],[`ak`,`ak`],[`appid`,`appid`]])}
            ${V([[`api_key`,`api_key`],[`token`,`token`],[`tk`,`tk`],[`ak`,`ak`],[`appid`,`appid`]],s)}
          </select>
        </div>
        <div class="key-row-main">
          <input name="key_secret" type="password" autocomplete="new-password" ${o?`required`:``} placeholder="${r.hasSecret?`留空保留 ${r.maskedPreview||`****`}`:`输入明文 Key`}">
          <select name="key_placement">
            ${V(Lt,c)}
          </select>
          <input name="key_paramName" value="${j(l)}" placeholder="key">
        </div>
        <div class="key-row-main">
          <input name="key_priority" type="number" min="0" max="10000" value="${r.priority??100}" aria-label="优先级">
          <input name="key_weight" type="number" min="1" max="1000" value="${r.weight??1}" aria-label="权重">
          <input name="key_qpsLimit" type="number" min="0" value="${r.qpsLimit??0}" aria-label="QPS 限制">
          <input name="key_dailyLimit" type="number" min="0" value="${r.dailyLimit??0}" aria-label="每日限制">
          <input name="key_monthlyLimit" type="number" min="0" value="${r.monthlyLimit??0}" aria-label="每月限制">
        </div>
        <div class="flex-actions">
          ${t&&r.id?`<button type="button" class="btn-link" data-tile-sources-test-key="${j(e.id)}:${j(r.id)}">测试 Key</button>`:``}
          <button type="button" class="btn-link btn-danger-link" data-tile-sources-remove-key="${i}">移除</button>
          ${a===`loading`?`<span class="test-status test-loading">测试中...</span>`:``}
          ${a&&a!==`loading`&&a.success?`<span class="test-status test-success">可用</span>`:``}
          ${a&&a!==`loading`&&!a.success?`<span class="test-status test-fail" title="${j(Ut(a))}">不可用</span>`:``}
        </div>
      </div>
    `}).join(``)||`<p style="color:#64748b;">暂无 Key，请添加至少一个 Key。</p>`}function En(e){let t=e.keyPools||[],n=e.sourcePresets||[],r=e.tileSources||[],i=e.editingKeyPool;if(i){let a=!t.some(e=>e.id===i.id);return`
      <div class="form-card">
        <h3>${a?`创建密钥池`:`编辑密钥池: ${j(i.id)}`}</h3>
        <form data-tile-sources-form="key-pool">
          <input type="hidden" name="isNew" value="${a}">
          <div class="form-grid">
            <div class="field-group">
              <label>密钥池 ID</label>
              <input name="id" required value="${j(i.id||``)}" ${a?``:`readonly`} placeholder="maptiler-main">
            </div>
            <div class="field-group">
              <label>密钥池名称</label>
              <input name="name" required value="${j(i.name||``)}" placeholder="MapTiler 主密钥池">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>厂商</label>
              <input name="vendor" value="${j(i.vendor||`custom`)}">
            </div>
            <div class="field-group">
              <label>作用域</label>
              <select name="scope">
                ${V(zt,i.scope||`global`)}
              </select>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>选择策略</label>
              <select name="strategy">
                ${V(Rt,i.strategy||`round_robin`)}
              </select>
            </div>
            <div class="field-group">
              <label>失败冷却 / 单请求重试</label>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <input name="cooldownMs" type="number" min="0" max="3600000" value="${i.cooldownMs??3e5}" aria-label="失败冷却毫秒">
                <input name="maxRetriesPerRequest" type="number" min="1" max="10" value="${i.maxRetriesPerRequest??2}" aria-label="单请求最大换 Key 次数">
              </div>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>默认 Key 类型</label>
              <select name="defaultSecretType">
                ${Wt(i.defaultSecretType||`api_key`,[[`api_key`,`api_key`],[`token`,`token`],[`tk`,`tk`],[`ak`,`ak`],[`appid`,`appid`]])}
                ${V([[`api_key`,`api_key`],[`token`,`token`],[`tk`,`tk`],[`ak`,`ak`],[`appid`,`appid`]],i.defaultSecretType||`api_key`)}
              </select>
            </div>
            <div class="field-group">
              <label>默认注入方式 / 参数名</label>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <select name="defaultPlacement">
                  ${V(Lt,i.defaultPlacement||`query`)}
                </select>
                <input name="defaultParamName" value="${j(i.defaultParamName||`key`)}" placeholder="key / tk / ak / access_token">
              </div>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>允许的预设 ID (半角逗号分隔)</label>
              <input name="allowedPresetIds" value="${j((i.allowedPresetIds||[]).join(`,`))}" list="source-preset-id-list">
              <datalist id="source-preset-id-list">
                ${n.map(e=>`<option value="${j(e.presetId)}"></option>`).join(``)}
              </datalist>
            </div>
            <div class="field-group">
              <label>允许的图源 ID (半角逗号分隔)</label>
              <input name="allowedSourceIds" value="${j((i.allowedSourceIds||[]).join(`,`))}" list="source-id-list">
              <datalist id="source-id-list">
                ${r.map(e=>`<option value="${j(e.id)}"></option>`).join(``)}
              </datalist>
            </div>
          </div>
          <div class="field-group">
            <label>官方申请 / 控制台入口</label>
            <input name="credentialUrl" type="url" value="${j(i.credentialUrl||``)}" placeholder="https://provider.example.com/console">
          </div>
          <div class="field-group">
            <label>描述</label>
            <textarea name="description" rows="2">${j(i.description||``)}</textarea>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="key_pool_enabled" name="enabled" ${i.enabled===!1?``:`checked`}>
            <label for="key_pool_enabled" style="font-weight:600;">启用该密钥池</label>
          </div>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">密钥列表</legend>
            <div class="key-rows">
              ${Tn(i,!a,e)}
            </div>
            <button type="button" class="btn-link" data-tile-sources-add-key style="margin-top:10px;">+ 添加 Key</button>
          </fieldset>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存密钥池</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="key-pool">取消</button>
          </div>
        </form>
      </div>
    `}return`
    <div class="admin-panel-head">
      <h3>密钥池管理</h3>
      <button type="button" data-tile-sources-add="key-pool">+ 新建密钥池</button>
    </div>
    <table class="item-table">
      <thead>
        <tr>
          <th>ID / 名称</th>
          <th>厂商 / 策略</th>
          <th>Key 数量</th>
          <th>引用限制</th>
          <th>连通测试</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${t.map(t=>{let n=e[`test_key_pool_${t.id}`]||``,r=(t.keys||[]).filter(e=>e.enabled!==!1).length;return`
            <tr>
              <td>
                <strong>${j(t.name)}</strong>
                <div style="color:#64748b; font-size:11px; margin-top:2px;">${j(t.id)}</div>
                ${t.credentialUrl?`<div style="margin-top:4px;">${Zt(t,`申请 / 管理 Key`)}</div>`:``}
              </td>
              <td>
                <span class="badge-gray">${j(t.vendor)}</span>
                <span class="badge-blue" style="margin-left:4px;">${j(Rt.find(([e])=>e===t.strategy)?.[1]||t.strategy)}</span>
                <div style="color:#64748b; font-size:11px; margin-top:4px;">${j(t.defaultSecretType||`api_key`)} / ${j(t.defaultParamName||`key`)}</div>
              </td>
              <td>${r}/${(t.keys||[]).length} 可用</td>
              <td>
                <span class="badge-gray">预设 ${(t.allowedPresetIds||[]).length}</span>
                <span class="badge-gray" style="margin-left:4px;">图源 ${(t.allowedSourceIds||[]).length}</span>
              </td>
              <td>
                <button type="button" class="btn-link" data-tile-sources-test-key-pool="${t.id}">测试</button>
                ${n===`loading`?`<span class="test-status test-loading">测试中...</span>`:``}
                ${n&&n!==`loading`&&n.success?`<span class="test-status test-success">可用 ${n.enabledKeyCount}/${n.totalKeyCount}</span>`:``}
                ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" title="${j(Ut(n))}">失败</span>`:``}
              </td>
              <td>${vn(t.enabled,`key-pool`,t.id,`启用中`,`已禁用`)}</td>
              <td>
                <div class="flex-actions">
                  <button type="button" class="btn-link" data-tile-sources-edit-key-pool="${t.id}">编辑</button>
                  <button type="button" class="btn-link btn-danger-link" data-tile-sources-delete-key-pool="${t.id}">删除</button>
                </div>
              </td>
            </tr>
          `}).join(``)||`<tr><td colspan="7" style="text-align:center; color:#64748b; padding:20px;">暂无密钥池</td></tr>`}
      </tbody>
    </table>
  `}function Dn(e){let t=e.mapLayers||[],n=e.editingMapLayer;if(n){let r=!t.some(e=>e.id===n.id),i=e.tileSources||[],a=n.items||[{sourceId:``,opacity:1,zIndex:0}];return`
      <div class="form-card">
        <h3>${r?`创建组合图层`:`编辑组合图层: ${j(n.id)}`}</h3>
        <form data-tile-sources-form="layer">
          <input type="hidden" name="isNew" value="${r}">
          <div class="form-grid">
            <div class="field-group">
              <label>图层唯一 ID</label>
              <input name="id" value="${j(n.id||``)}" required ${r?``:`readonly`} placeholder="例如: hybrid-sat">
            </div>
            <div class="field-group">
              <label>图层显示名称</label>
              <input name="name" value="${j(n.name||``)}" required placeholder="例如: 高德/卫星">
            </div>
          </div>
          
          <div class="form-grid">
            <div class="field-group">
              <label>图层展示类型</label>
              <select name="type">
                <option value="base" ${n.type===`base`?`selected`:``}>底图图层</option>
                <option value="overlay" ${n.type===`overlay`?`selected`:``}>叠加图层</option>
              </select>
            </div>
            <div class="field-group">
              <label>图层排序权重</label>
              <input name="sortOrder" type="number" value="${n.sortOrder??10}">
            </div>
          </div>

          <div class="form-grid">
            <div class="field-group">
              <label>缩放范围 (最小 - 最大)</label>
              <div style="display:flex; gap:10px; align-items:center;">
                <input name="minZoom" type="number" value="${n.minZoom??3}" min="0" max="22" style="flex:1;">
                <span>至</span>
                <input name="maxZoom" type="number" value="${n.maxZoom??18}" min="0" max="22" style="flex:1;">
              </div>
            </div>
            <div class="field-group">
              <label>适用客户端</label>
              <div style="display:flex; gap:20px; align-items:center; margin-top:10px;">
                <label style="display:inline-flex; align-items:center; gap:6px; font-weight:normal;">
                  <input type="checkbox" name="client_2d" value="2d" ${(n.clients||[`2d`,`3d`]).includes(`2d`)?`checked`:``}> 2D 地图
                </label>
                <label style="display:inline-flex; align-items:center; gap:6px; font-weight:normal;">
                  <input type="checkbox" name="client_3d" value="3d" ${(n.clients||[`2d`,`3d`]).includes(`3d`)?`checked`:``}> 3D 地图
                </label>
              </div>
            </div>
          </div>

          <div class="form-grid single">
            <div class="field-group">
              <label>图层描述</label>
              <input name="description" value="${j(n.description||``)}" placeholder="可描述图层构成">
            </div>
          </div>

          <div class="field-group" style="margin-top:15px;">
            <label style="font-weight:600; display:flex; justify-content:space-between; align-items:center;">
              <span>包含图源组合 (从下往上叠加)</span>
              <button type="button" class="btn-link" data-tile-sources-add-layer-item>+ 添加图源</button>
            </label>
            <div class="layer-items-list" data-tile-sources-items-container>
              ${a.map((e,t)=>`
                <div class="layer-item-row" data-layer-item-index="${t}">
                  <span style="font-weight:bold; color:#64748b; font-size:11px; width:20px;">#${t+1}</span>
                  <select name="item_sourceId" required>
                    <option value="">请选择系统图源</option>
                    ${i.map(t=>`<option value="${t.id}" ${e.sourceId===t.id?`selected`:``}>${j(t.name)} (${t.id} / ${Gt(t.kind)})</option>`).join(``)}
                  </select>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <span style="font-size:12px; color:#475569;">不透明度:</span>
                    <input name="item_opacity" type="number" step="0.1" min="0" max="1" value="${e.opacity??1}" style="width:60px;">
                  </div>
                  <div class="flex-actions" style="margin-left:auto;">
                    <button type="button" class="btn-link" data-tile-sources-move-up="${t}">↑</button>
                    <button type="button" class="btn-link" data-tile-sources-move-down="${t}">↓</button>
                    <button type="button" class="btn-link btn-danger-link" data-tile-sources-remove-layer-item="${t}">移除</button>
                  </div>
                </div>
              `).join(``)}
            </div>
          </div>

          <div class="checkbox-group" style="margin-top:15px;">
            <input type="checkbox" id="layer_visible" name="frontendVisible" ${n.frontendVisible===!1?``:`checked`}>
            <label for="layer_visible">前台地图可见 (可见性)</label>
          </div>
          <div class="checkbox-group">
            <input type="checkbox" id="layer_enabled" name="enabled" ${n.enabled===!1?``:`checked`}>
            <label for="layer_enabled" style="font-weight:600;">启用该图层组合</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存配置</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="layer">取消</button>
          </div>
        </form>
      </div>
    `}return`
    <div class="admin-panel-head">
      <h3>组合图层配置</h3>
      <button type="button" data-tile-sources-add="layer">+ 新增图层配置</button>
    </div>
    
    <table class="item-table">
      <thead>
        <tr>
          <th>ID / 图层名称</th>
          <th>图层类型</th>
          <th>包含子图源 (透明度)</th>
          <th>缩放级</th>
          <th>客户端</th>
          <th>状态</th>
          <th>默认底图</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${t.map(t=>`
          <tr>
            <td>
              <strong>${j(t.name)}</strong>
              <div style="color: #64748b; font-size:11px; margin-top:2px;">${j(t.id)}</div>
            </td>
            <td>
              <span class="badge-gray">${t.type===`base`?`基础底图`:`叠加图层`}</span>
            </td>
            <td>
              <div style="display:flex; flex-direction:column; gap:4px;">
                ${(t.items||[]).map((t,n)=>{let r=(e.tileSources||[]).find(e=>e.id===t.sourceId),i=r?r.name:t.sourceId;return`<div style="font-size:12px;">#${n+1} ${j(i)} (${t.opacity??1})</div>`}).join(``)}
              </div>
            </td>
            <td>${t.minZoom}-${t.maxZoom}</td>
            <td>
              ${(t.clients||[]).map(e=>`<span class="badge-blue">${e.toUpperCase()}</span>`).join(` `)}
            </td>
            <td>
              ${vn(t.enabled,`layer`,t.id,`启用中`,`已禁用`)}
            </td>
            <td>
              ${t.default?`<span class="badge-green" style="font-weight:bold;">默认</span>`:`<button type="button" class="btn-link" data-tile-sources-set-default="${t.id}">设为默认</button>`}
            </td>
            <td>
              <div class="flex-actions">
                <button type="button" class="btn-link" data-tile-sources-edit-layer="${t.id}">编辑</button>
                <button type="button" class="btn-link btn-danger-link" data-tile-sources-delete-layer="${t.id}">删除</button>
              </div>
            </td>
          </tr>
        `).join(``)||`<tr><td colspan="8" style="text-align:center;">暂无图层配置</td></tr>`}
      </tbody>
    </table>
  `}function On(e){let t=e.externalPublishes||[],n=e.editingExternalPublish,r=e.selectedPublishId||t[0]?.id||``;if(n){let r=!t.some(e=>e.id===n.id),i=e.tileSources||[],a=i.filter(e=>e.visibility?.scope!==`external_only`&&e.permissions?.externalApiAllowed!==!1),o=i.filter(e=>e.visibility?.scope===`external_only`),s=e.mapLayers||[],c=e.proxyOutbounds||[],l=e.proxyPools||[],u=n.targetType||`source`,d=u===`layer`?s.map(e=>`<option value="${e.id}" ${n.targetId===e.id?`selected`:``}>${j(e.name)} (${e.id})</option>`).join(``):u===`dedicated_source`?o.map(e=>`<option value="${e.id}" ${n.targetId===e.id?`selected`:``}>${j(e.name)} (${e.id} / ${Gt(e.kind)})</option>`).join(``):a.map(e=>`<option value="${e.id}" ${n.targetId===e.id?`selected`:``}>${j(e.name)} (${e.id} / ${Gt(e.kind)})</option>`).join(``),f=n.overrides?.proxy||null,p=n.overrides?.cache||null;return`
      <div class="form-card">
        <h3>${r?`创建公开对外发布项`:`编辑发布项: ${j(n.id)}`}</h3>
        <form data-tile-sources-form="publish">
          <input type="hidden" name="isNew" value="${r}">
          <div class="form-grid">
            <div class="field-group">
              <label>发布项 ID</label>
              <input name="id" value="${j(n.id||``)}" required ${r?``:`readonly`} placeholder="例如: amap-sat-public">
            </div>
            <div class="field-group">
              <label>发布项名称</label>
              <input name="name" value="${j(n.name||``)}" required placeholder="例如: 高德卫星图源对外公开服务">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>发布对象类型</label>
              <select name="targetType" data-publish-target-type>
                <option value="source" ${u===`source`?`selected`:``}>发布系统图源</option>
                <option value="dedicated_source" ${u===`dedicated_source`?`selected`:``}>发布专用图源</option>
                <option value="layer" ${u===`layer`?`selected`:``}>发布组合图层</option>
              </select>
            </div>
            <div class="field-group">
              <label>选择关联对象</label>
              <select name="targetId" required>
                <option value="">请选择${j(Qt(u))}</option>
                ${d}
              </select>
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>访问路径标识</label>
              <input name="pathSlug" value="${j(n.pathSlug||``)}" required placeholder="例如: satellite-api">
            </div>
            <div class="field-group">
              <label>Token 鉴权模式</label>
              <select name="auth_mode">
                <option value="none" ${n.auth?.mode===`none`?`selected`:``}>公开无限制</option>
                <option value="token" ${n.auth?.mode===`token`?`selected`:``}>需要验证鉴权</option>
              </select>
            </div>
          </div>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">流控限制 & 日志限制</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="pub_ratelimit" name="rateLimit_enabled" ${n.rateLimit?.enabled?`checked`:``}>
              <label for="pub_ratelimit">启用访问限流</label>
            </div>
            <div class="field-group" style="margin-top:10px;">
              <label>每分钟最大请求量</label>
              <input name="rateLimit_maxRequestsPerMinute" type="number" value="${n.rateLimit?.maxRequestsPerMinute??600}">
            </div>
            <hr style="margin:15px 0; border:none; border-top:1px solid #e2e8f0;">
            <div class="checkbox-group">
              <input type="checkbox" id="pub_log" name="log_enabled" ${n.log?.enabled===!1?``:`checked`}>
              <label for="pub_log">启用访问日志统计</label>
            </div>
            <div class="field-group" style="margin-top:10px;">
              <label>最大历史日志保留行数</label>
              <input name="log_maxLogCount" type="number" value="${n.log?.maxLogCount??500}">
            </div>
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">发布项代理覆盖</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="pub_proxy_override" name="proxy_override_enabled" ${f?`checked`:``}>
              <label for="pub_proxy_override">覆盖目标图源代理策略</label>
            </div>
            ${tn(f||{mode:`never`},c,l,`publish_proxy`)}
          </fieldset>

          <fieldset class="form-card" style="margin-top:15px; padding:15px; background:white;">
            <legend style="padding:0 5px; font-weight:600;">发布项缓存覆盖</legend>
            <div class="checkbox-group">
              <input type="checkbox" id="pub_cache_override" name="cache_override_enabled" ${p?`checked`:``}>
              <label for="pub_cache_override">覆盖目标图源缓存策略</label>
            </div>
            ${rn(p||{enabled:!0},`publish_cache`)}
          </fieldset>

          <div class="checkbox-group" style="margin-top:20px;">
            <input type="checkbox" id="pub_enabled" name="enabled" ${n.enabled===!1?``:`checked`}>
            <label for="pub_enabled" style="font-weight:600;">启用该对外服务发布项</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存发布</button>
            <button type="button" class="admin-form-cancel" data-tile-sources-cancel="publish">取消</button>
          </div>
        </form>
      </div>
    `}let i=e.lastGeneratedToken?`<div class="admin-token-notice">
        <span><strong>已成功重置 Token！您的明文 Token 是：</strong> <code>${j(e.lastGeneratedToken)}</code> <br><small>请立即复制，刷新或离开本页后此明文 Token 将不再出现！</small></span>
        <button type="button" class="admin-token-notice-close" data-tile-sources-close-token-notice aria-label="关闭 Token 提示">×</button>
       </div>`:``,a=t.find(e=>e.id===r),o=``;return a&&(o=en(a,e)),`
    ${i}
    
    <div class="admin-panel-head">
      <h3>对外发布项管理</h3>
      <button type="button" data-tile-sources-add="publish">+ 创建对外发布</button>
    </div>
    
    <table class="item-table">
      <thead>
        <tr>
          <th style="white-space: nowrap;">名称 / 标识 ID</th>
          <th style="white-space: nowrap;">目标类型</th>
          <th style="white-space: nowrap;">路径标识</th>
          <th style="white-space: nowrap;">鉴权方式</th>
          <th style="white-space: nowrap;">限流控制</th>
          <th style="white-space: nowrap;">连通测试</th>
          <th style="white-space: nowrap;">状态</th>
          <th style="white-space: nowrap;">管理操作</th>
        </tr>
      </thead>
      <tbody>
        ${t.map(t=>{let n=e[`test_publish_${t.id}`]||``;return`
            <tr style="background: ${t.id===r?`#f0fdfa`:`transparent`}; cursor:pointer;" data-tile-sources-select-publish="${t.id}">
              <td style="white-space: nowrap;">
                <strong style="display:inline-block; max-width:180px; overflow:hidden; text-overflow:ellipsis; vertical-align:middle;" title="${j(t.name)}">${j(t.name)}</strong>
                <div style="color: #64748b; font-size:11px; margin-top:2px;">${j(t.id)}</div>
              </td>
              <td style="white-space: nowrap;"><span class="badge-gray">${j(Qt(t.targetType))}</span></td>
              <td style="white-space: nowrap;"><code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-size:12px;">${j(t.pathSlug)}</code></td>
              <td style="white-space: nowrap;">
                ${t.auth?.mode===`token`?`<span class="badge-blue" title="Token预览: ${j(t.auth.tokenPreview||``)}">Token鉴权</span>`:`<span class="badge-gray">完全公开</span>`}
              </td>
              <td style="white-space: nowrap;">
                ${t.rateLimit?.enabled?`<span class="badge-green">${t.rateLimit.maxRequestsPerMinute} 请求/分</span>`:`<span class="badge-gray">无限制</span>`}
              </td>
              <td>
                <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                  <button type="button" class="btn-link" data-tile-sources-test-publish="${t.id}">测试</button>
                  ${n===`loading`?`<span class="test-status test-loading" style="margin-left: 0;">测试中...</span>`:``}
                  ${n&&n!==`loading`&&n.success?`<span class="test-status test-success" style="margin-left: 0;">成功 (${n.duration}ms)</span>`:``}
                  ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" style="margin-left: 0;" title="${j(Ut(n))}">失败</span>`:``}
                </div>
              </td>
              <td style="white-space: nowrap;">
                ${vn(t.enabled,`publish`,t.id,`已发布`,`已禁用`)}
              </td>
              <td style="white-space: nowrap;">
                <div class="flex-actions" style="flex-wrap: nowrap;">
                  <button type="button" class="btn-link" data-tile-sources-edit-publish="${t.id}">编辑</button>
                  ${t.auth?.mode===`token`?`<button type="button" class="btn-link" data-tile-sources-reset-token="${t.id}">重置</button>`:``}
                  <button type="button" class="btn-link btn-danger-link" data-tile-sources-delete-publish="${t.id}">注销</button>
                </div>
              </td>
            </tr>
          `}).join(``)||`<tr><td colspan="8" style="text-align:center;">暂无对外发布项</td></tr>`}
      </tbody>
    </table>

    ${o}
  `}function kn(e){e.diagnosticsLogType=e.diagnosticsLogType||`source`;let t=e.diagnosticsPublishId||``,n=e.diagnosticsSourceId||``,r=e.externalPublishes||[],i=e.tileSources||[],a=e.diagnosticsLogType===`source`,o=a?e.sourceAccessLogs||[]:e.diagnosticLogs||[],s=a?e.sourceAccessLogsError||``:e.diagnosticLogsError||``;return`
    <div class="admin-panel-head">
      <h3>运行诊断日志</h3>
      <div style="display:flex; gap:10px; align-items:center;">
        <div class="segmented-control">
          <button type="button" class="${a?`is-active`:``}" data-tile-sources-diagnostics-type="source">图源访问</button>
          <button type="button" class="${a?``:`is-active`}" data-tile-sources-diagnostics-type="external">对外 API</button>
        </div>
        ${a?`
            <span style="font-size:13px; color:#475569;">筛选图源:</span>
            <select data-tile-sources-source-diagnostic-filter style="padding:6px 10px; border-radius:4px; border:1px solid #cbd5e1; font-size:12px;">
              <option value="">查看所有图源</option>
              ${i.map(e=>`<option value="${e.id}" ${e.id===n?`selected`:``}>${j(e.name)}</option>`).join(``)}
            </select>
          `:`
            <span style="font-size:13px; color:#475569;">筛选发布项:</span>
            <select data-tile-sources-diagnostic-filter style="padding:6px 10px; border-radius:4px; border:1px solid #cbd5e1; font-size:12px;">
              <option value="">查看所有日志</option>
              ${r.map(e=>`<option value="${e.id}" ${e.id===t?`selected`:``}>${j(e.name)}</option>`).join(``)}
            </select>
          `}
        <button type="button" data-tile-sources-refresh-logs>刷新日志</button>
      </div>
    </div>

    <p style="margin: -4px 0 12px; color:#64748b; font-size:13px;">
      ${a?`图源访问日志独立记录通过代理或发生错误的图源请求，保留行数由图源配置单独控制。`:`对外 API 日志仅记录发布项访问，保留行数由发布项的日志配置控制。`}
    </p>

    <table class="item-table log-table">
      <thead>
        <tr>
          <th>时间</th>
          <th>${a?`图源 ID`:`发布项 ID`}</th>
          <th>关联图源</th>
          <th>客户端 IP</th>
          <th>坐标 (Z/X/Y)</th>
          <th>代理网关</th>
          <th>耗时</th>
          <th>缓存</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        ${s?`<tr><td colspan="9" style="text-align:center; color:#b91c1c; padding:20px;">${j(s)}</td></tr>`:o.map(e=>`
          <tr>
            <td style="color:#64748b;">${new Date(e.timestamp).toLocaleString()}</td>
            <td><strong>${j(a?e.sourceId||`-`:e.publishId||`-`)}</strong></td>
            <td><span class="badge-gray">${j(e.sourceId||`-`)}</span></td>
            <td><code>${j(e.clientIp)}</code></td>
            <td><code>${j(e.coordinates)}</code></td>
            <td>${xn(e)}</td>
            <td>${j(e.duration??0)}ms</td>
            <td>${yn(e.cacheStatus)}</td>
            <td>${bn(e)}</td>
          </tr>
        `).join(``)||`<tr><td colspan="9" style="text-align:center; color:#64748b; padding:20px;">${a?`暂无图源访问日志`:`暂无相关的对外访问日志`}</td></tr>`}
      </tbody>
    </table>
  `}async function An(e,t){e.tileSourcesSubTab===`diagnostics`&&await jn(e,t)}async function jn(e,t){if(e.diagnosticsLogType=e.diagnosticsLogType||`source`,e.diagnosticsLogType===`source`){await Nn(e,t);return}await Mn(e,t)}async function Mn(e,t){e.loading=!0;try{let n=e.diagnosticsPublishId||``;e.diagnosticLogs=await t.listExternalPublishLogs(n),e.diagnosticLogsError=``}catch(t){e.diagnosticLogs=[],e.diagnosticLogsError=t.message}finally{e.loading=!1}}async function Nn(e,t){e.loading=!0;try{let n=e.diagnosticsSourceId||``;e.sourceAccessLogs=await t.listSourceAccessLogs(n),e.sourceAccessLogsError=``}catch(t){e.sourceAccessLogs=[],e.sourceAccessLogsError=t.message}finally{e.loading=!1}}async function Pn(e){let{event:t,state:n,api:r,renderDashboard:i,showConfirm:a,setNotice:o}=e,s=t.target.closest(`[data-tile-sources-tab]`);if(s)return n.tileSourcesSubTab=s.getAttribute(`data-tile-sources-tab`),n.editingTileSource=null,n.editingMapLayer=null,n.editingProxyOutbound=null,n.editingProxyPool=null,n.editingExternalPublish=null,n.editingKeyPool=null,n.creatingSourceFromPreset=null,n.tileSourcesSubTab===`diagnostics`&&await jn(n,r),i(),!0;if(t.target.closest(`[data-tile-sources-close-token-notice]`))return n.lastGeneratedToken=null,i(),!0;if(t.target.closest(`[data-tile-sources-refresh-logs]`))return await jn(n,r),i(),!0;let c=t.target.closest(`[data-tile-sources-diagnostics-type]`);if(c)return n.diagnosticsLogType=c.getAttribute(`data-tile-sources-diagnostics-type`),await jn(n,r),i(),!0;let l=t.target.closest(`[data-tile-sources-select-publish]`);if(l&&!t.target.closest(`button`))return n.selectedPublishId=l.getAttribute(`data-tile-sources-select-publish`),i(),!0;if(t.target.closest(`[data-tile-sources-add="source"]`))return n.editingTileSource={id:``,name:``,vendor:``,category:`custom`,kind:`xyz-raster`,adapter:`template`,presetId:``,entry:{template:``,styleJsonUrl:``,tileJsonUrl:``,pmtilesUrl:``,glyphsUrl:``,spritesUrl:``},minZoom:3,maxZoom:18,maxNativeZoom:18,tileSize:256,retina:{mode:`fixed`,param:`scale`,normalValue:`1`,retinaValue:`1`},subdomains:[],secrets:{required:!1,keyPoolId:``,placement:`query`,paramName:`key`},rendering:{engine:`leaflet`,clients:[`2d`,`3d`],fallbackRasterSourceId:``},cache:{enabled:!0,ttlMs:216e5,staleTtlMs:2592e6},proxy:{mode:`never`,fallbackToDirect:!1},accessLog:{enabled:!0,maxLogCount:500},permissions:{frontendVisible:!0,precacheAllowed:!0,externalApiAllowed:!0,userReferenceAllowed:!1},visibility:{scope:`system`},license:{cacheAllowedByLicense:!0,publicUseAllowed:!1,officialStatus:`internal`,licenseType:`unknown`}},i(),!0;if(t.target.closest(`[data-tile-sources-cancel="source"]`))return n.editingTileSource=null,i(),!0;let u=t.target.closest(`[data-tile-sources-toggle-source]`);if(u){let e=u.getAttribute(`data-tile-sources-toggle-source`),t=(n.tileSources||[]).find(t=>t.id===e);if(!t)return!0;let a=t.enabled===!1;n.loading=!0,i();try{await r.updateTileSource(e,{enabled:a}),await J(n,r,{tileSources:!0}),o(`图源已${a?`启用`:`禁用`}`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let d=t.target.closest(`[data-tile-sources-edit-source]`);if(d){let e=d.getAttribute(`data-tile-sources-edit-source`);n.loading=!0,i();try{n.editingTileSource=await r.getTileSource(e)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let f=t.target.closest(`[data-tile-sources-delete-source]`);if(f){let e=f.getAttribute(`data-tile-sources-delete-source`);if(await a(`确定要删除图源 "${e}" 吗？如果该图源已被图层或发布项引用将报错阻止。`,`确认删除图源`)){n.loading=!0,i();try{await r.deleteTileSource(e),await J(n,r,{tileSources:!0}),o(`删除图源成功`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let p=t.target.closest(`[data-tile-sources-test-source]`);if(p){let e=p.getAttribute(`data-tile-sources-test-source`);n[`test_source_${e}`]=`loading`,i();try{let t=await r.testTileSource(e);n[`test_source_${e}`]=t}catch(t){n[`test_source_${e}`]={success:!1,error:t.message}}finally{i()}return!0}let m=t.target.closest(`[data-tile-sources-create-from-preset]`);if(m){let e=m.getAttribute(`data-tile-sources-create-from-preset`),t=(n.sourcePresets||[]).find(t=>t.presetId===e);if(!t)return!0;let r=Xt(t,n.keyPools||[]);return n.creatingSourceFromPreset={presetId:e,id:e.replace(/^preset:/,``),name:t.name,enabled:!1,keyPoolId:r?.id||``,permissions:{frontendVisible:!1,externalApiAllowed:!1,userReferenceAllowed:!1}},i(),!0}if(t.target.closest(`[data-tile-sources-cancel="preset-source"]`))return n.creatingSourceFromPreset=null,i(),!0;if(t.target.closest(`[data-tile-sources-add="key-pool"]`))return n.editingKeyPool={id:``,name:``,vendor:`custom`,enabled:!0,scope:`global`,strategy:`round_robin`,cooldownMs:3e5,maxRetriesPerRequest:2,defaultSecretType:`api_key`,defaultPlacement:`query`,defaultParamName:`key`,credentialUrl:``,allowedPresetIds:[],allowedSourceIds:[],keys:[{id:``,alias:``,enabled:!0,secretType:`api_key`,placement:`query`,paramName:`key`,priority:100,weight:1,qpsLimit:0,dailyLimit:0,monthlyLimit:0}],description:``},i(),!0;if(t.target.closest(`[data-tile-sources-cancel="key-pool"]`))return n.editingKeyPool=null,i(),!0;let ee=t.target.closest(`[data-tile-sources-toggle-key-pool]`);if(ee){let e=ee.getAttribute(`data-tile-sources-toggle-key-pool`),t=(n.keyPools||[]).find(t=>t.id===e);if(!t)return!0;let a=t.enabled===!1;n.loading=!0,i();try{await r.updateKeyPool(e,{enabled:a}),await J(n,r,{keyPools:!0,precacheCatalog:!1}),o(`密钥池已${a?`启用`:`禁用`}`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let h=t.target.closest(`[data-tile-sources-edit-key-pool]`);if(h){let e=h.getAttribute(`data-tile-sources-edit-key-pool`);n.loading=!0,i();try{n.editingKeyPool=await r.getKeyPool(e)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let g=t.target.closest(`[data-tile-sources-delete-key-pool]`);if(g){let e=g.getAttribute(`data-tile-sources-delete-key-pool`);if(await a(`确认删除密钥池 "${e}"？如果仍被图源引用将被后端阻止。`,`删除密钥池`)){n.loading=!0,i();try{await r.deleteKeyPool(e),await J(n,r,{keyPools:!0,precacheCatalog:!1}),o(`删除密钥池成功`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let te=t.target.closest(`[data-tile-sources-test-key-pool]`);if(te){let e=te.getAttribute(`data-tile-sources-test-key-pool`);n[`test_key_pool_${e}`]=`loading`,i();try{n[`test_key_pool_${e}`]=await r.testKeyPool(e)}catch(t){n[`test_key_pool_${e}`]={success:!1,error:t.message}}finally{i()}return!0}let ne=t.target.closest(`[data-tile-sources-test-key]`);if(ne){fn(n,ne.closest(`form`));let[e,t]=ne.getAttribute(`data-tile-sources-test-key`).split(`:`);n[`test_key_${e}_${t}`]=`loading`,i();try{n[`test_key_${e}_${t}`]=await r.testKeyPoolKey(e,t)}catch(r){n[`test_key_${e}_${t}`]={success:!1,error:r.message}}finally{i()}return!0}if(t.target.closest(`[data-tile-sources-add-key]`))return n.editingKeyPool?(fn(n,t.target.closest(`form`)),n.editingKeyPool.keys=n.editingKeyPool.keys||[],n.editingKeyPool.keys.push({id:``,alias:``,enabled:!0,secretType:n.editingKeyPool.defaultSecretType||`api_key`,placement:n.editingKeyPool.defaultPlacement||`query`,paramName:n.editingKeyPool.defaultParamName||`key`,priority:100,weight:1,qpsLimit:0,dailyLimit:0,monthlyLimit:0}),i(),!0):!0;let re=t.target.closest(`[data-tile-sources-remove-key]`);if(re){if(!n.editingKeyPool)return!0;fn(n,re.closest(`form`));let e=parseInt(re.getAttribute(`data-tile-sources-remove-key`),10);return n.editingKeyPool.keys.splice(e,1),i(),!0}if(t.target.closest(`[data-tile-sources-add="layer"]`))return n.editingMapLayer={id:``,name:``,type:`base`,sortOrder:10,minZoom:3,maxZoom:18,clients:[`2d`,`3d`],items:[{sourceId:``,opacity:1,zIndex:0}]},i(),!0;if(t.target.closest(`[data-tile-sources-cancel="layer"]`))return n.editingMapLayer=null,i(),!0;let ie=t.target.closest(`[data-tile-sources-toggle-layer]`);if(ie){let e=ie.getAttribute(`data-tile-sources-toggle-layer`),t=(n.mapLayers||[]).find(t=>t.id===e);if(!t)return!0;let a=t.enabled===!1;if(t.default&&!a)return o(``,`默认图层不能直接禁用，请先设置新的默认图层`),!0;n.loading=!0,i();try{await r.updateMapLayer(e,{enabled:a}),await J(n,r,{mapLayers:!0}),o(`组合图层已${a?`启用`:`禁用`}`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let ae=t.target.closest(`[data-tile-sources-edit-layer]`);if(ae){let e=ae.getAttribute(`data-tile-sources-edit-layer`);return n.editingMapLayer=JSON.parse(JSON.stringify(n.mapLayers.find(t=>t.id===e))),i(),!0}let oe=t.target.closest(`[data-tile-sources-delete-layer]`);if(oe){let e=oe.getAttribute(`data-tile-sources-delete-layer`);if(await a(`确认删除图层组合 "${e}"？`,`确认删除`)){n.loading=!0,i();try{await r.deleteMapLayer(e),await J(n,r,{mapLayers:!0}),o(`删除图层组合成功`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let se=t.target.closest(`[data-tile-sources-set-default]`);if(se){let e=se.getAttribute(`data-tile-sources-set-default`);n.loading=!0,i();try{await r.setDefaultMapLayer(e),await J(n,r,{mapLayers:!0}),o(`已将该图层设为默认展示`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}if(t.target.closest(`[data-tile-sources-add-layer-item]`))return n.editingMapLayer.items.push({sourceId:``,opacity:1,zIndex:n.editingMapLayer.items.length}),i(),!0;let _=t.target.closest(`[data-tile-sources-remove-layer-item]`);if(_){let e=parseInt(_.getAttribute(`data-tile-sources-remove-layer-item`));return n.editingMapLayer.items.length>1?(n.editingMapLayer.items.splice(e,1),i()):o(``,`图层组合中必须包含至少一个图源`),!0}let v=t.target.closest(`[data-tile-sources-move-up]`);if(v){let e=parseInt(v.getAttribute(`data-tile-sources-move-up`));if(e>0){let t=n.editingMapLayer.items,r=t[e];t[e]=t[e-1],t[e-1]=r,i()}return!0}let ce=t.target.closest(`[data-tile-sources-move-down]`);if(ce){let e=parseInt(ce.getAttribute(`data-tile-sources-move-down`)),t=n.editingMapLayer.items;if(e<t.length-1){let n=t[e];t[e]=t[e+1],t[e+1]=n,i()}return!0}if(t.target.closest(`[data-tile-sources-add="publish"]`))return n.editingExternalPublish={id:``,name:``,targetType:`source`,targetId:``,pathSlug:``,auth:{mode:`token`},rateLimit:{enabled:!0,maxRequestsPerMinute:600},log:{enabled:!0,maxLogCount:500},overrides:{proxy:null,cache:null},enabled:!0},i(),!0;if(t.target.closest(`[data-tile-sources-cancel="publish"]`))return n.editingExternalPublish=null,i(),!0;let y=t.target.closest(`[data-tile-sources-toggle-publish]`);if(y){let e=y.getAttribute(`data-tile-sources-toggle-publish`),t=(n.externalPublishes||[]).find(t=>t.id===e);if(!t)return!0;let a=t.enabled===!1;n.loading=!0,i();try{await r.updateExternalPublish(e,{enabled:a}),await J(n,r,{externalPublishes:!0,precacheCatalog:!1}),o(`对外发布项已${a?`发布`:`禁用`}`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}return!0}let le=t.target.closest(`[data-tile-sources-edit-publish]`);if(le){let e=le.getAttribute(`data-tile-sources-edit-publish`);return n.editingExternalPublish=JSON.parse(JSON.stringify(n.externalPublishes.find(t=>t.id===e))),i(),!0}let b=t.target.closest(`[data-tile-sources-delete-publish]`);if(b){let e=b.getAttribute(`data-tile-sources-delete-publish`);if(await a(`确认注销并删除外部发布接口项 "${e}" 吗？`,`注销对外服务`)){n.loading=!0,i();try{await r.deleteExternalPublish(e),await J(n,r,{externalPublishes:!0,precacheCatalog:!1}),o(`成功注销对外发布服务`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let ue=t.target.closest(`[data-tile-sources-reset-token]`);if(ue){let e=ue.getAttribute(`data-tile-sources-reset-token`);if(await a(`确认要重置该对外服务的 Token 吗？旧 Token 将会立即失效！`,`重置 Token 凭证`)){n.loading=!0,i();try{n.lastGeneratedToken=(await r.resetExternalPublishToken(e)).token,await J(n,r,{externalPublishes:!0,precacheCatalog:!1}),o(`Token 已重置，请记录您的新明文 Token`)}catch(e){o(``,e.message)}finally{n.loading=!1,i()}}return!0}let x=t.target.closest(`[data-tile-sources-test-publish]`);if(x){let e=x.getAttribute(`data-tile-sources-test-publish`);n[`test_publish_${e}`]=`loading`,i();try{let t=await r.testExternalPublish(e);n[`test_publish_${e}`]=t}catch(t){n[`test_publish_${e}`]={success:!1,error:t.message}}finally{i()}return!0}return!1}async function Fn(e){let{event:t,state:n,api:r,renderDashboard:i,setNotice:a}=e,o=t.target.closest(`[data-tile-sources-form]`);if(!o)return!1;t.preventDefault();let s=o.getAttribute(`data-tile-sources-form`);n.loading=!0,i();let c=new FormData(o),l=c.get(`isNew`)===`true`;try{if(s===`source`){let e=c.get(`id`),t=c.get(`tileScale`)||`1`,i=c.get(`kind`)||`xyz-raster`,s=ln(c),u=K(o,c);Kt(i)&&u.engine===`leaflet`&&(u.engine=`maplibre`);let d={id:e,name:c.get(`name`),enabled:!!o.elements.enabled?.checked,vendor:c.get(`vendor`),category:c.get(`category`),kind:i,adapter:c.get(`adapter`),presetId:c.get(`presetId`)||``,schema:c.get(`schema`)||``,entry:s,template:s.template,styleJsonUrl:s.styleJsonUrl,tileJsonUrl:s.tileJsonUrl,pmtilesUrl:s.pmtilesUrl,subdomains:cn(c,`subdomains`),minZoom:parseInt(c.get(`minZoom`)),maxZoom:parseInt(c.get(`maxZoom`)),maxNativeZoom:parseInt(c.get(`maxNativeZoom`)),tileSize:256,retina:{mode:`fixed`,param:`scale`,normalValue:t,retinaValue:t},secrets:un(o,c),rendering:u,attribution:c.get(`license_attribution`)||``,coordinateSystem:c.get(`coordinateSystem`)||`EPSG:3857`,tags:cn(c,`tags`),description:c.get(`description`),license:dn(o,c),cache:sn(o,c,`cache`),proxy:an(o,c,`proxy`),accessLog:{enabled:!!o.elements.accessLog_enabled?.checked,maxLogCount:parseInt(c.get(`accessLog_maxLogCount`))||0},permissions:{frontendVisible:o.elements.perm_frontendVisible.checked,precacheAllowed:o.elements.perm_precacheAllowed.checked,externalApiAllowed:o.elements.perm_externalApiAllowed.checked,userReferenceAllowed:!!o.elements.perm_userReferenceAllowed?.checked},visibility:{scope:c.get(`visibility_scope`)||`system`}};l?await r.createTileSource(d):await r.updateTileSource(e,d),n.editingTileSource=null,await J(n,r,{tileSources:!0}),a(`保存图源配置成功`)}else if(s===`preset-source`){let e=c.get(`presetId`),t=o.elements.enabled,i={id:c.get(`id`),name:c.get(`name`),enabled:!!(t&&!t.disabled&&t.checked),keyPoolId:c.get(`keyPoolId`)||``,permissions:{frontendVisible:!!o.elements.perm_frontendVisible?.checked,precacheAllowed:!1,externalApiAllowed:!!o.elements.perm_externalApiAllowed?.checked,userReferenceAllowed:!!o.elements.perm_userReferenceAllowed?.checked},visibility:{scope:`system`}};await r.createSourceFromPreset(e,i),n.creatingSourceFromPreset=null,n.tileSourcesSubTab=`sources`,await J(n,r,{tileSources:!0}),a(`已基于预设创建图源`)}else if(s===`key-pool`){let e=c.get(`id`),t=q(o,c);l?await r.createKeyPool(t):await r.updateKeyPool(e,t),n.editingKeyPool=null,await J(n,r,{keyPools:!0,precacheCatalog:!1}),a(`保存密钥池成功`)}else if(s===`layer`){let e=c.get(`id`),t=o.querySelectorAll(`select[name="item_sourceId"]`),i=o.querySelectorAll(`input[name="item_opacity"]`),s=[];if(t.forEach((e,t)=>{e.value&&s.push({sourceId:e.value,opacity:parseFloat(i[t].value||1),zIndex:t})}),!s.length)throw Error(`组合图层必须包含至少一个有效图源`);let u={id:e,name:c.get(`name`),enabled:o.elements.enabled.checked,frontendVisible:o.elements.frontendVisible.checked,default:n.editingMapLayer.default||!1,type:c.get(`type`),sortOrder:parseInt(c.get(`sortOrder`)),minZoom:parseInt(c.get(`minZoom`)),maxZoom:parseInt(c.get(`maxZoom`)),clients:[o.elements.client_2d.checked?`2d`:``,o.elements.client_3d.checked?`3d`:``].filter(Boolean),items:s,description:c.get(`description`)};l?await r.createMapLayer(u):await r.updateMapLayer(e,u),n.editingMapLayer=null,await J(n,r,{mapLayers:!0}),a(`保存图层组合成功`)}else if(s===`publish`){let e=c.get(`id`),t=!!o.elements.proxy_override_enabled?.checked,i=!!o.elements.cache_override_enabled?.checked,s={id:e,name:c.get(`name`),enabled:o.elements.enabled.checked,targetType:c.get(`targetType`),targetId:c.get(`targetId`),pathSlug:c.get(`pathSlug`),auth:{mode:c.get(`auth_mode`)},rateLimit:{enabled:o.elements.rateLimit_enabled.checked,maxRequestsPerMinute:parseInt(c.get(`rateLimit_maxRequestsPerMinute`))},log:{enabled:o.elements.log_enabled.checked,maxLogCount:parseInt(c.get(`log_maxLogCount`))},overrides:{proxy:t?an(o,c,`publish_proxy`):null,cache:i?sn(o,c,`publish_cache`):null}};l?n.lastGeneratedToken=(await r.createExternalPublish(s)).token:await r.updateExternalPublish(e,s),n.editingExternalPublish=null,await J(n,r,{externalPublishes:!0,precacheCatalog:!1}),a(`保存对外发布服务成功`)}}catch(e){a(``,e.message)}finally{n.loading=!1,i()}return!0}async function In(e){let{event:t,state:n,renderDashboard:r}=e,i=t.target.closest(`[data-proxy-mode-select]`);if(i){let e=i.value,t=i.closest(`form`),n=t.querySelector(`[data-proxy-outbound-field]`),r=t.querySelector(`[data-proxy-pool-field]`);return n&&(n.style.display=e===`fixed`?`flex`:`none`),r&&(r.style.display=e===`pool`?`flex`:`none`),!0}let a=t.target.closest(`select[name="kind"]`);if(a&&n.editingTileSource){let e=a.closest(`form`),t=e.elements.adapter,n=e.elements.rendering_engine,r=e.elements.rendering_client_3d;return Kt(a.value)?(t&&(!t.value||t.value===`template`)&&(t.value=`maplibre-style`),n&&n.value===`leaflet`&&(n.value=`maplibre`),r&&(r.checked=!1)):t&&!t.value&&(t.value=`template`),!0}let o=t.target.closest(`[data-publish-target-type]`);if(o&&n.editingExternalPublish)return n.editingExternalPublish.targetType=o.value,n.editingExternalPublish.targetId=``,r(),!0;let s=t.target.closest(`[data-tile-sources-diagnostic-filter]`);if(s)return n.diagnosticsLogType=`external`,n.diagnosticsPublishId=s.value,await Mn(n,e.api),r(),!0;let c=t.target.closest(`[data-tile-sources-source-diagnostic-filter]`);if(c)return n.diagnosticsLogType=`source`,n.diagnosticsSourceId=c.value,await Nn(n,e.api),r(),!0;if(n.editingMapLayer){let e=t.target.closest(`select[name="item_sourceId"]`),r=t.target.closest(`input[name="item_opacity"]`);if(e||r){let i=t.target.closest(`[data-layer-item-index]`),a=parseInt(i.getAttribute(`data-layer-item-index`));return e&&(n.editingMapLayer.items[a].sourceId=e.value),r&&(n.editingMapLayer.items[a].opacity=parseFloat(r.value||1)),!0}}return!1}function Ln(e){return e?.errorMessage||e?.error||``}function Rn(e){let t=Array.isArray(e?.members)?e.members:[];if(!t.length)return{successCount:0,totalCount:0,fastestMs:null};let n=t.filter(e=>e.success),r=n.map(e=>Number(e.duration)).filter(Number.isFinite);return{successCount:n.length,totalCount:t.length,fastestMs:r.length?Math.min(...r):null}}function Y(e){e.editingProxyOutbound=e.editingProxyOutbound||null,e.editingProxyPool=e.editingProxyPool||null;let t=e.proxyOutbounds||[],n=e.proxyPools||[],r=e.editingProxyOutbound,i=e.editingProxyPool,a=``;if(r){let e=!t.some(e=>e.id===r.id);a=`
      <div class="form-card animate-fade-in">
        <h3>${e?`创建代理出口`:`编辑代理出口: ${j(r.id)}`}</h3>
        <form data-proxy-form="outbound">
          <input type="hidden" name="isNew" value="${e}">
          <div class="form-grid">
            <div class="field-group">
              <label>出口 ID</label>
              <input name="id" value="${j(r.id||``)}" required ${e?``:`readonly`} placeholder="例如: hk-clash">
            </div>
            <div class="field-group">
              <label>出口名称</label>
              <input name="name" value="${j(r.name||``)}" required placeholder="例如: 香港节点">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>协议</label>
              <select name="protocol">
                <option value="http" ${r.protocol===`http`?`selected`:``}>HTTP</option>
                <option value="https" ${r.protocol===`https`?`selected`:``}>HTTPS</option>
              </select>
            </div>
            <div class="field-group">
              <label>代理服务器地址</label>
              <input name="host" value="${j(r.host||``)}" required placeholder="example">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>端口</label>
              <input name="port" type="number" value="${r.port??7890}" required>
            </div>
            <div class="field-group">
              <label>用户名</label>
              <input name="username" value="${j(r.username||``)}">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>密码（留空不修改）</label>
              <input name="password" type="password" placeholder="${r.hasPassword?`********`:`无密码`}">
            </div>
            <div class="field-group">
              <label>连通测试链接</label>
              <input name="testUrl" value="${j(r.testUrl||`https://www.google.com/generate_204`)}">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>超时时间（毫秒）</label>
              <input name="timeoutMs" type="number" value="${r.timeoutMs??8e3}">
            </div>
            <div class="field-group">
              <label>备注描述</label>
              <input name="description" value="${j(r.description||``)}">
            </div>
          </div>
          
          <div class="checkbox-group" style="margin-top:15px;">
            <input type="checkbox" id="outbound_enabled" name="enabled" ${r.enabled===!1?``:`checked`}>
            <label for="outbound_enabled" style="font-weight:600;">启用该代理出口</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存出口</button>
            <button type="button" class="admin-form-cancel" data-proxy-cancel="outbound">取消</button>
          </div>
        </form>
      </div>
    `}else if(i){let e=!n.some(e=>e.id===i.id),r=i.members||[];a=`
      <div class="form-card animate-fade-in">
        <h3>${e?`创建代理池`:`编辑代理池: ${j(i.id)}`}</h3>
        <form data-proxy-form="pool">
          <input type="hidden" name="isNew" value="${e}">
          <div class="form-grid">
            <div class="field-group">
              <label>代理池 ID</label>
              <input name="id" value="${j(i.id||``)}" required ${e?``:`readonly`} placeholder="例如: proxy-pool-hk">
            </div>
            <div class="field-group">
              <label>代理池名称</label>
              <input name="name" value="${j(i.name||``)}" required placeholder="例如: 智能负载代理池">
            </div>
          </div>
          <div class="form-grid">
            <div class="field-group">
              <label>负载分配策略</label>
              <select name="strategy">
                <option value="priority" ${i.strategy===`priority`?`selected`:``}>按优先级顺序选择</option>
                <option value="round_robin" ${i.strategy===`round_robin`?`selected`:``}>均摊轮询选择</option>
                <option value="failover" ${i.strategy===`failover`?`selected`:``}>主备失败自动切换</option>
              </select>
            </div>
            <div class="field-group">
              <label>代理池描述</label>
              <input name="description" value="${j(i.description||``)}">
            </div>
          </div>

          <div class="field-group" style="margin-top:15px;">
            <label style="font-weight:600;">关联代理出口及优先级/权重</label>
            <div class="layer-items-list">
              ${t.map(e=>{let t=r.find(t=>t.outboundId===e.id),n=!!t,i=t?.priority??100,a=t?.weight??1;return`
                  <div style="display:flex; gap:12px; align-items:center; background:#f8fafc; padding:6px 12px; border-radius:4px;">
                    <label style="display:inline-flex; align-items:center; gap:8px; width:220px; font-weight:500; cursor:pointer;">
                      <input type="checkbox" name="pool_outbound_id" value="${e.id}" ${n?`checked`:``}>
                      <span>${j(e.name)}</span>
                      <small style="color:#64748b;">(${e.host}:${e.port})</small>
                    </label>
                    <div style="display:flex; align-items:center; gap:4px;">
                      <span style="font-size:12px; color:#475569;">优先级:</span>
                      <input name="pool_priority_${e.id}" type="number" value="${i}" style="width:60px; padding:4px;">
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                      <span style="font-size:12px; color:#475569;">权重:</span>
                      <input name="pool_weight_${e.id}" type="number" value="${a}" style="width:60px; padding:4px;">
                    </div>
                  </div>
                `}).join(``)||`<p style="color:#64748b;">暂无可用的代理出口，请先在下方创建代理出口！</p>`}
            </div>
          </div>

          <div class="checkbox-group" style="margin-top:15px;">
            <input type="checkbox" id="pool_enabled" name="enabled" ${i.enabled===!1?``:`checked`}>
            <label for="pool_enabled" style="font-weight:600;">启用该代理池</label>
          </div>

          <div style="margin-top:25px; display:flex; gap:15px;">
            <button type="submit" class="admin-form-submit">保存代理池</button>
            <button type="button" class="admin-form-cancel" data-proxy-cancel="pool">取消</button>
          </div>
        </form>
      </div>
    `}else a=`
      <div style="margin-bottom:40px;">
        <div class="admin-panel-head">
          <h3>代理出口</h3>
          <button type="button" data-proxy-add="outbound">+ 新建代理出口</button>
        </div>
        
        <table class="item-table">
          <thead>
            <tr>
              <th>ID / 出口名称</th>
              <th>协议</th>
              <th>出口主机</th>
              <th>代理认证</th>
              <th>接口测试</th>
              <th>状态</th>
              <th>管理操作</th>
            </tr>
          </thead>
          <tbody>
            ${t.map(t=>{let n=e[`test_outbound_${t.id}`]||``;return`
                <tr>
                  <td>
                    <strong>${j(t.name)}</strong>
                    <div style="color: #64748b; font-size:11px; margin-top:2px;">${j(t.id)}</div>
                  </td>
                  <td><span class="badge-gray">${t.protocol.toUpperCase()}</span></td>
                  <td><code>${j(t.host)}:${t.port}</code></td>
                  <td>
                    ${t.username?`<span class="badge-blue" title="已配置代理用户名密码">${j(t.username)}</span>`:`<span style="color:#94a3b8; font-size:12px;">免密/匿名</span>`}
                  </td>
                  <td>
                    <button type="button" class="btn-link" data-proxy-test-outbound="${t.id}">测试连接</button>
                    ${n===`loading`?`<span class="test-status test-loading">测试中...</span>`:``}
                    ${n&&n!==`loading`&&n.success?`<span class="test-status test-success">成功 (${n.duration}ms)</span>`:``}
                    ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" title="${j(Ln(n))}">失败: ${j(Ln(n))}</span>`:``}
                  </td>
                  <td>
                    ${t.enabled?`<span class="badge-green">已启用</span>`:`<span class="badge-red">已禁用</span>`}
                  </td>
                  <td>
                    <div class="flex-actions">
                      <button type="button" class="btn-link" data-proxy-edit-outbound="${t.id}">编辑</button>
                      <button type="button" class="btn-link btn-danger-link" data-proxy-delete-outbound="${t.id}">删除</button>
                    </div>
                  </td>
                </tr>
              `}).join(``)||`<tr><td colspan="7" style="text-align:center; color:#64748b; padding:20px;">暂无配置的代理出口</td></tr>`}
          </tbody>
        </table>
      </div>

      <div>
        <div class="admin-panel-head">
          <h3>代理出口池</h3>
          <button type="button" data-proxy-add="pool">+ 新建代理池</button>
        </div>
        
        <table class="item-table">
          <thead>
            <tr>
              <th>ID / 代理池名称</th>
              <th>路由分配策略</th>
              <th>关联出口数量</th>
              <th>连通批量测试</th>
              <th>使用状态</th>
              <th>管理操作</th>
            </tr>
          </thead>
          <tbody>
            ${n.map(t=>{let n=e[`test_pool_${t.id}`]||``,r=n&&n!==`loading`?Rn(n):null;return`
                <tr>
                  <td>
                    <strong>${j(t.name)}</strong>
                    <div style="color: #64748b; font-size:11px; margin-top:2px;">${j(t.id)}</div>
                  </td>
                  <td>
                    <span class="badge-blue">${j(t.strategy)}</span>
                  </td>
                  <td>
                    <strong>${(t.members||[]).length}</strong> 个出口
                  </td>
                  <td>
                    <button type="button" class="btn-link" data-proxy-test-pool="${t.id}">批量连通测试</button>
                    ${n===`loading`?`<span class="test-status test-loading">测试中...</span>`:``}
                    ${n&&n!==`loading`&&n.success?`<span class="test-status test-success">可用 ${r.successCount}/${r.totalCount}${r.fastestMs===null?``:` (最快: ${r.fastestMs}ms)`}</span>`:``}
                    ${n&&n!==`loading`&&!n.success?`<span class="test-status test-fail" title="${j(Ln(n))}">失败: ${j(Ln(n))}</span>`:``}
                  </td>
                  <td>
                    ${t.enabled?`<span class="badge-green">已启用</span>`:`<span class="badge-red">已禁用</span>`}
                  </td>
                  <td>
                    <div class="flex-actions">
                      <button type="button" class="btn-link" data-proxy-edit-pool="${t.id}">编辑</button>
                      <button type="button" class="btn-link btn-danger-link" data-proxy-delete-pool="${t.id}">删除</button>
                    </div>
                  </td>
                </tr>
              `}).join(``)||`<tr><td colspan="6" style="text-align:center; color:#64748b; padding:20px;">暂无配置的代理出口池</td></tr>`}
          </tbody>
        </table>
      </div>
    `;return`
    <section class="admin-panel tile-sources-panel">


      ${a}
    </section>
  `}function zn(e){e.editingProxyOutbound=null,e.editingProxyPool=null}async function Bn({api:e,event:t,state:n,renderDashboard:r,showConfirm:i,setNotice:a}){if(t.target.closest(`[data-proxy-add="outbound"]`))return n.editingProxyOutbound={id:``,name:``,protocol:`http`,host:``,port:7890,username:``,password:``,testUrl:`https://www.google.com/generate_204`,timeoutMs:8e3,description:``,enabled:!0},r(),!0;if(t.target.closest(`[data-proxy-cancel="outbound"]`))return n.editingProxyOutbound=null,r(),!0;if(t.target.closest(`[data-proxy-edit-outbound]`)){let e=t.target.closest(`[data-proxy-edit-outbound]`).getAttribute(`data-proxy-edit-outbound`);return n.editingProxyOutbound=JSON.parse(JSON.stringify(n.proxyOutbounds.find(t=>t.id===e))),r(),!0}if(t.target.closest(`[data-proxy-delete-outbound]`)){let o=t.target.closest(`[data-proxy-delete-outbound]`).getAttribute(`data-proxy-delete-outbound`);if(await i(`确认删除代理出口 “${j(o)}” 吗？`)){a(`正在删除代理出口`);try{await e.deleteProxyOutbound(o),n.proxyOutbounds=await e.listProxyOutbounds(),a(`删除成功`)}catch(e){a(``,e.message)}r()}return!0}if(t.target.closest(`[data-proxy-test-outbound]`)){let i=t.target.closest(`[data-proxy-test-outbound]`).getAttribute(`data-proxy-test-outbound`);n[`test_outbound_${i}`]=`loading`,r();try{let t=await e.testProxyOutbound(i);n[`test_outbound_${i}`]=t}catch(e){n[`test_outbound_${i}`]={success:!1,error:e.message}}return r(),!0}if(t.target.closest(`[data-proxy-add="pool"]`))return n.editingProxyPool={id:``,name:``,strategy:`priority`,description:``,enabled:!0,members:[]},r(),!0;if(t.target.closest(`[data-proxy-cancel="pool"]`))return n.editingProxyPool=null,r(),!0;if(t.target.closest(`[data-proxy-edit-pool]`)){let e=t.target.closest(`[data-proxy-edit-pool]`).getAttribute(`data-proxy-edit-pool`);return n.editingProxyPool=JSON.parse(JSON.stringify(n.proxyPools.find(t=>t.id===e))),r(),!0}if(t.target.closest(`[data-proxy-delete-pool]`)){let o=t.target.closest(`[data-proxy-delete-pool]`).getAttribute(`data-proxy-delete-pool`);if(await i(`确认删除代理池 “${j(o)}” 吗？`)){a(`正在删除代理池`);try{await e.deleteProxyPool(o),n.proxyPools=await e.listProxyPools(),a(`删除成功`)}catch(e){a(``,e.message)}r()}return!0}if(t.target.closest(`[data-proxy-test-pool]`)){let i=t.target.closest(`[data-proxy-test-pool]`).getAttribute(`data-proxy-test-pool`);n[`test_pool_${i}`]=`loading`,r();try{let t=await e.testProxyPool(i);n[`test_pool_${i}`]=t}catch(e){n[`test_pool_${i}`]={success:!1,error:e.message}}return r(),!0}return!1}async function Vn({api:e,event:t,state:n,renderDashboard:r,setNotice:i}){let a=t.target.closest(`[data-proxy-form="outbound"]`);if(a){t.preventDefault(),i(`正在保存代理出口`);let o=a.elements.isNew.value===`true`,s=a.elements.id.value.trim(),c={name:a.elements.name.value.trim(),protocol:a.elements.protocol.value,host:a.elements.host.value.trim(),port:parseInt(a.elements.port.value,10),username:a.elements.username.value.trim(),testUrl:a.elements.testUrl.value.trim(),timeoutMs:parseInt(a.elements.timeoutMs.value,10),description:a.elements.description.value.trim(),enabled:a.elements.enabled.checked},l=a.elements.password.value;l&&(c.password=l);try{o?await e.createProxyOutbound({id:s,...c}):await e.updateProxyOutbound(s,c),n.proxyOutbounds=await e.listProxyOutbounds(),n.editingProxyOutbound=null,i(`保存成功`)}catch(e){i(``,e.message)}return r(),!0}let o=t.target.closest(`[data-proxy-form="pool"]`);if(o){t.preventDefault(),i(`正在保存代理池`);let a=o.elements.isNew.value===`true`,s=o.elements.id.value.trim(),c=[];o.querySelectorAll(`input[name="pool_outbound_id"]:checked`).forEach(e=>{let t=e.value,n=parseInt(o.querySelector(`[name="pool_priority_${t}"]`).value,10),r=parseInt(o.querySelector(`[name="pool_weight_${t}"]`).value,10);c.push({outboundId:t,priority:n,weight:r})});let l={name:o.elements.name.value.trim(),strategy:o.elements.strategy.value,description:o.elements.description.value.trim(),enabled:o.elements.enabled.checked,members:c};try{a?await e.createProxyPool({id:s,...l}):await e.updateProxyPool(s,l),n.proxyPools=await e.listProxyPools(),n.editingProxyPool=null,i(`保存成功`)}catch(e){i(``,e.message)}return r(),!0}return!1}function Hn(){return!1}var Un=[{id:`overview`,label:`概览`,render:Oe},{id:`cache`,label:`缓存`,render:ke,handleClick:Ae},{id:`kml`,label:`KML管理`,render:At,handleClick:I,handleChange:R},{id:`precache`,label:`预缓存`,render:Je,afterRender:wt,afterEnter:N,afterLoad:N,handleSubmit:ft,handleClick:pt,handleChange:mt},{id:`tile-sources`,label:`图源管理`,render:Sn,afterEnter:An,afterLoad:An,handleClick:Pn,handleSubmit:Fn,handleChange:In},{id:`proxy`,label:`代理配置`,render:Y,afterEnter:zn,afterLoad:zn,handleClick:Bn,handleSubmit:Vn,handleChange:Hn},{id:`settings`,label:`设置`,render:P,handleSubmit:F}];function Wn(e){return`/admin/${Gn(e).id}`}function Gn(e){return Un.find(t=>t.id===e)||Un[0]}function Kn(e){return Un.some(t=>t.id===e)}function qn(e){return e.pathname===`/admin`||e.pathname.startsWith(`/admin/`)||new URLSearchParams(e.search).get(`view`)===`admin`}function X(e){let[,t,n]=e.pathname.split(`/`);if(t===`admin`)return Kn(n)?n:`overview`;let r=new URLSearchParams(e.search).get(`tab`);return Kn(r)?r:`overview`}function Jn(e){if(!e.message&&!e.error&&!e.loading)return``;let t=e.error||e.message||`正在加载`,n=!!e.error,r=!e.error&&(e.message===`正在加载`||e.message===`正在登录`||e.loading);return`
    <div class="admin-notice ${n?`is-error`:``}" role="${n?`alert`:`status`}" aria-live="${n?`assertive`:`polite`}">
      <span>${j(t)}</span>
      ${r?``:`<button type="button" class="admin-notice-close" data-admin-action="close-notice" aria-label="关闭提示">×</button>`}
    </div>
  `}function Yn(e){e.root.innerHTML=`
    <section class="admin-login">
      <form class="admin-login-panel" data-admin-login>
        <p class="admin-kicker">map-service</p>
        <h1>管理后台</h1>
        ${Jn(e)}
        <label>
          <span>用户名</span>
          <input name="username" autocomplete="username" required>
        </label>
        <label>
          <span>密码</span>
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <button type="submit">登录</button>
        <a href="/">返回地图</a>
      </form>
    </section>
  `}function Xn(e,t){e.root.innerHTML=`
    <section class="admin-shell">
      <header class="admin-topbar">
        <div>
          <p class="admin-kicker">map-service</p>
          <h1>管理后台</h1>
        </div>
        <nav class="admin-actions" aria-label="管理后台操作">
          <a class="admin-icon-link" href="/" aria-label="返回地图">⌖</a>
          <button type="button" data-admin-action="refresh" aria-label="刷新">↻</button>
          <button type="button" data-admin-action="logout" aria-label="退出">⎋</button>
        </nav>
      </header>
      ${Jn(e)}
      <div class="admin-layout">
        <nav class="admin-tabs" aria-label="后台导航">
          ${Un.map(t=>`
            <a href="${Wn(t.id)}" data-admin-tab="${t.id}" class="${e.activeTab===t.id?`is-active`:``}">
              ${j(t.label)}
            </a>
          `).join(``)}
        </nav>
        <div class="admin-content">
          ${t}
        </div>
      </div>
    </section>
  `}var Z={root:null,activeTab:`overview`,loading:!1,message:``,error:``,session:null,system:null,cache:null,cacheLoading:!1,cacheError:``,visits:null,visitsLoading:!1,visitsError:``,settings:null,tasks:[],kmls:[],precacheForm:{providerId:``,bounds:{west:113.24,south:23.11,east:113.29,north:23.15},minZoom:12,maxZoom:12,concurrency:4,requestIntervalMs:0,refresh:!1},precacheEstimate:null,precacheEstimateStatus:``,precacheEstimateError:``,expandedTaskIds:new Set,amapLoader:null,AMap:null,map:null,rectangle:null,precacheMapHeight:260},Zn=null;function Qn(e){Zn=e}function Q(e=``,t=``){Z.message=e,Z.error=t,Zn&&Zn(e,t)}function $n(e){Kn(e)&&(Z.activeTab=e)}var er=null;Qn((e,t)=>{er&&=(clearTimeout(er),null);let n=t||e;n&&n!==`正在加载`&&n!==`正在登录`&&(er=setTimeout(()=>{Q(``),document.querySelector(`[data-admin-login]`)?Yn(Z):ir()},4e3))});function tr(){return X(window.location)}function nr(e){window.history.replaceState(null,``,`${Wn(e)}${window.location.hash}`)}function rr(){return Gn(Z.activeTab).render(Z)}function ir(){Xn(Z,rr()),Gn(Z.activeTab).afterRender?.(Z,A)}window.renderDashboard=ir;function ar(e){return{api:A,event:e,renderDashboard:ir,setNotice:Q,showCheckboxConfirm:me,showConfirm:pe,state:Z}}function or(...e){(!e.length||e.includes(Z.activeTab))&&ir()}async function $(e,t){let n=Gn(Z.activeTab)[e];return n instanceof Function?!!await n(ar(t)):!1}async function sr(e={}){let t=!!e.cacheOnly;Object.assign(Z,{cacheLoading:!0,cacheError:``,visitsLoading:t?Z.visitsLoading:!0,visitsError:t?Z.visitsError:``}),or(`overview`,`cache`),A.cache().then(e=>{Z.cache=e,Z.cacheError=``,e.refreshing&&window.setTimeout(()=>sr({cacheOnly:!0}),1500)}).catch(e=>{Z.cacheError=e.message}).finally(()=>{Z.cacheLoading=!1,or(`cache`)}),!t&&A.visits().then(e=>{Z.visits=e,Z.visitsError=``}).catch(e=>{Z.visitsError=e.message}).finally(()=>{Z.visitsLoading=!1,or(`overview`)})}async function cr(){Z.loading=!0,Q(`正在加载`),ir();try{let[e,t,n,r,i,a,o,s,c,l,u,d,f]=await Promise.all([A.session(),A.system(),A.settings(),A.tasks(),A.kmls(),A.listTileSources(),A.listSourcePresets(),A.listKeyPools(),A.listMapLayers(),A.listProxyOutbounds(),A.listProxyPools(),A.listExternalPublishes(),A.precacheCatalog()]);Object.assign(Z,{session:e,system:t,settings:n,tasks:r,kmls:i,tileSources:a,sourcePresets:o,keyPools:s,mapLayers:c,proxyOutbounds:l,proxyPools:u,externalPublishes:d,precacheCatalog:f,loading:!1}),Q(``),ir(),Gn(Z.activeTab).afterLoad?.(Z,A),sr()}catch(e){Z.loading=!1,e.status===401?(xe(),Q(``,e.message),Yn(Z)):(Q(``,e.message),ir())}}async function lr(e){let t=e.target.closest(`[data-admin-login]`);if(t){e.preventDefault(),Q(`正在登录`),Yn(Z);try{await be({username:t.elements.username.value,password:t.elements.password.value}),Q(``),await cr()}catch(e){Q(``,e.message),Yn(Z)}return}await $(`handleSubmit`,e)}async function ur(e){let t=e.target.closest(`[data-admin-tab]`);if(t){e.preventDefault(),$n(t.getAttribute(`data-admin-tab`)),nr(Z.activeTab),ir(),Gn(Z.activeTab).afterEnter?.(Z,A);return}let n=e.target.closest(`[data-admin-action]`);if(n){let e=n.getAttribute(`data-admin-action`);if(e===`logout`){xe(),Q(``),Yn(Z);return}if(e===`refresh`){await cr();return}if(e===`close-notice`){Q(``),document.querySelector(`[data-admin-login]`)?Yn(Z):ir();return}}await $(`handleClick`,e)}async function dr(e){await $(`handleChange`,e)}async function fr(e={}){if(document.body.classList.add(`admin-view`),$n(tr()),nr(Z.activeTab),Z.amapLoader=e.amapLoader||null,Z.root=document.getElementById(`admin-root`),Z.root.hidden=!1,Z.root.addEventListener(`submit`,lr),Z.root.addEventListener(`click`,ur),Z.root.addEventListener(`change`,dr),Z.root.addEventListener(`input`,dr),!ve()){Yn(Z);return}await cr()}function pr(){`serviceWorker`in navigator&&window.addEventListener(`load`,()=>{navigator.serviceWorker.register(`/sw.js`).catch(e=>{console.warn(`Service Worker 注册失败`,e)})})}async function mr(e){let{init:t,title:n=`私有地图服务`,message:r=`管理员启用了访问控制，请输入密码解锁`,submitText:i=`载入地图`,loadingText:a=`正在验证...`}=e;try{(await Se()).required?hr({init:t,title:n,message:r,submitText:i,loadingText:a}):await t()}catch(e){console.error(`Failed to check map access status`,e),hr({init:t,title:n,message:`访问状态检查失败，请稍后重试`,submitText:i,loadingText:a,allowRetry:!0})}}function hr(e){let{init:t,title:n,message:r,submitText:i,loadingText:a,allowRetry:o=!1}=e;document.getElementById(`map-lock-screen`)?.remove();let s=document.createElement(`div`);s.id=`map-lock-screen`,s.className=`lock-screen-backdrop`,s.innerHTML=`
    <div class="lock-screen-card">
      <div class="lock-screen-icon">🔒</div>
      <h2>${j(n)}</h2>
      <p>${j(r)}</p>
      <form id="lock-screen-form" autocomplete="off">
        <div class="lock-screen-field">
          <input type="password" name="password" placeholder="请输入访问密码" required autofocus>
        </div>
        <div id="lock-screen-error" class="lock-screen-error" style="${o?``:`display: none;`}">${o?j(r):``}</div>
        <button type="submit">${j(i)}</button>
        ${o?`<button type="button" class="lock-screen-secondary" data-lock-retry>重试检查</button>`:``}
      </form>
    </div>
  `,document.body.appendChild(s);let c=document.getElementById(`lock-screen-form`),l=document.getElementById(`lock-screen-error`);s.querySelector(`[data-lock-retry]`)?.addEventListener(`click`,()=>{s.remove(),mr({init:t,title:n,submitText:i,loadingText:a})}),c.addEventListener(`submit`,async e=>{e.preventDefault(),l.style.display=`none`;let n=c.elements.password.value.trim();if(!n)return;let r=c.querySelector(`button[type="submit"]`);try{r.disabled=!0,r.textContent=a,await Ce(n),s.remove(),await t()}catch(e){r.disabled=!1,r.textContent=i,l.textContent=e.message||`访问密码错误`,l.style.display=`block`}})}export{o as C,u as S,c as T,_,kt as a,h as b,fe as c,w as d,ce as f,se as g,x as h,qn as i,pe as l,ue as m,pr as n,Dt as o,le as p,fr as r,j as s,mr as t,he as u,p as v,l as w,d as x,m as y};
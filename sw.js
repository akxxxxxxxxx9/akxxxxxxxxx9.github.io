/* ===========================================================
 * sw.js
 * ===========================================================
 * Copyright 2016 @huxpro
 * Licensed under Apache 2.0
 * Service Worker 脚本文件，用于缓存静态资源，提高 GitHub Pages 的加载速度。
 * ========================================================== */

// CACHE_NAMESPACE
// CacheStorage 是一个共享的存储区域，不同站点的缓存可能会互相冲突。
// 使用命名空间来防止缓存名称冲突和误删除。
const CACHE_NAMESPACE = 'main-'

// 定义缓存的名称
const CACHE = CACHE_NAMESPACE + 'precache-then-runtime';

// 要预缓存的静态资源列表
const PRECACHE_LIST = [
  "./", // 首页
  "./offline.html", // 离线页面
  "./js/jquery.min.js", // jQuery 库
  "./js/bootstrap.min.js", // Bootstrap JS
  "./js/hux-blog.min.js", // 博客主脚本
  "./js/snackbar.js", // 通知脚本
  "./img/icon_wechat.png", // 微信图标
  "./img/avatar-hux.jpg", // 头像图片
  "./img/home-bg.jpg", // 首页背景图片
  "./img/404-bg.jpg", // 404 页面背景图片
  "./css/hux-blog.min.css", // 博客主样式
  "./css/bootstrap.min.css" // Bootstrap 样式
  // 其他资源可以根据需要解开注释
];

// 允许的主机名白名单，只有这些主机的请求会被缓存
const HOSTNAME_WHITELIST = [
  self.location.hostname, // 当前站点
  "huangxuan.me", // 示例站点
  "yanshuo.io", // 示例站点
  "cdnjs.cloudflare.com" // CDN 服务
];

// 过时的缓存名称列表，用于清理老旧的缓存
const DEPRECATED_CACHES = ['precache-v1', 'runtime', 'main-precache-v1', 'main-runtime'];

/**
 * 工具函数：为请求添加 Cache Busting 参数，避免缓存污染
 * @param {Request} req 请求对象
 * @returns {string} 带有 cache-bust 参数的 URL
 */
const getCacheBustingUrl = (req) => {
  var now = Date.now(); // 当前时间戳
  url = new URL(req.url);

  // 确保协议与当前站点一致（避免混合内容问题）
  url.protocol = self.location.protocol;

  // 添加 Query 参数，用于 Cache Busting
  url.search += (url.search ? '&' : '?') + 'cache-bust=' + now;
  return url.href;
};

/**
 * 工具函数：检查请求是否为导航请求
 * @param {Request} req 请求对象
 * @returns {boolean} 是否为导航请求
 */
const isNavigationReq = (req) => (
  req.mode === 'navigate' || 
  (req.method === 'GET' && req.headers.get('accept').includes('text/html'))
);

/**
 * 工具函数：检查请求是否带有文件扩展名
 * @param {Request} req 请求对象
 * @returns {boolean} 请求路径是否以扩展名结尾
 */
const endWithExtension = (req) => Boolean(new URL(req.url).pathname.match(/\.\w+$/));

/**
 * 工具函数：判断是否需要重定向
 * @param {Request} req 请求对象
 * @returns {boolean} 是否需要重定向
 */
const shouldRedirect = (req) => (
  isNavigationReq(req) && 
  new URL(req.url).pathname.substr(-1) !== "/" && 
  !endWithExtension(req)
);

/**
 * 工具函数：获取重定向后的 URL
 * @param {Request} req 请求对象
 * @returns {string} 重定向后的 URL
 */
const getRedirectUrl = (req) => {
  url = new URL(req.url);
  url.pathname += "/";
  return url.href;
};

/**
 * 生命周期：Install
 * 缓存静态资源
 */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll(PRECACHE_LIST) // 添加预缓存资源
        .then(self.skipWaiting()) // 跳过等待，立即激活
        .catch(err => console.log(err)); // 捕获错误
    })
  );
});

/**
 * 生命周期：Activate
 * 清理旧缓存，激活新的 Service Worker
 */
self.addEventListener('activate', event => {
  caches.keys().then(cacheNames => Promise.all(
    cacheNames
      .filter(cacheName => DEPRECATED_CACHES.includes(cacheName)) // 过滤过时的缓存
      .map(cacheName => caches.delete(cacheName)) // 删除过时缓存
  ));
  console.log('Service Worker 已激活');
  event.waitUntil(self.clients.claim()); // 接管页面控制权
});

/**
 * 工具对象：fetchHelper
 * 提供 fetchThenCache 和 cacheFirst 两种缓存策略
 */
var fetchHelper = {
  fetchThenCache: function(request){
    const init = { mode: "cors", credentials: "omit" }; // 初始化请求配置

    const fetched = fetch(request, init); // 从网络获取资源
    const fetchedCopy = fetched.then(resp => resp.clone()); // 克隆响应以供缓存

    Promise.all([fetchedCopy, caches.open(CACHE)])
      .then(([response, cache]) => response.ok && cache.put(request, response)) // 缓存成功的响应
      .catch(_ => {/* 忽略错误 */});
    
    return fetched;
  },

  cacheFirst: function(url){
    return caches.match(url) // 优先从缓存获取
      .then(resp => resp || this.fetchThenCache(url)) // 如果没有缓存则从网络获取
      .catch(_ => {/* 忽略错误 */});
  }
};

/**
 * 生命周期：Fetch
 * 拦截所有网络请求，并根据策略处理
 */
self.addEventListener('fetch', event => {
  if (HOSTNAME_WHITELIST.indexOf(new URL(event.request.url).hostname) > -1) {
    if (shouldRedirect(event.request)) {
      event.respondWith(Response.redirect(getRedirectUrl(event.request))); // 重定向请求
      return;
    }

    // 使用缓存优先策略处理静态资源
    if (event.request.url.indexOf('ys.static') > -1){
      event.respondWith(fetchHelper.cacheFirst(event.request.url));
      return;
    }

    // 网络优先策略 + 回退到离线页面
    const cached = caches.match(event.request);
    const fetched = fetch(getCacheBustingUrl(event.request), { cache: "no-store" });
    const fetchedCopy = fetched.then(resp => resp.clone());

    event.respondWith(
      Promise.race([fetched.catch(_ => cached), cached]) // 网络或缓存优先
        .then(resp => resp || fetched)
        .catch(_ => caches.match('offline.html')) // 回退到离线页面
    );

    event.waitUntil(
      Promise.all([fetchedCopy, caches.open(CACHE)])
        .then(([response, cache]) => response.ok && cache.put(event.request, response))
        .catch(_ => {/* 忽略错误 */})
    );
  }
});

/**
 * 工具函数：广播消息到所有客户端
 */
function sendMessageToAllClients(msg) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => client.postMessage(msg)); // 发送消息
  });
}

/**
 * 工具函数：重新验证内容是否更新
 */
function revalidateContent(cachedResp, fetchedResp) {
  return Promise.all([cachedResp, fetchedResp])
    .then(([cached, fetched]) => {
      const cachedVer = cached.headers.get('last-modified');
      const fetchedVer = fetched.headers.get('last-modified');
      if (cachedVer !== fetchedVer) {
        sendMessageToAllClients({
          'command': 'UPDATE_FOUND',
          'url': fetched.url
        });
      }
    })
    .catch(err => console.log(err));
}
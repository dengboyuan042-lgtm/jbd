const chromium = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');
(async () => {
  const exe = await chromium.executablePath();
  console.log('exe', exe);
  const browser = await puppeteer.launch({args: chromium.args, executablePath: exe, headless: 'shell'});
  const page = await browser.newPage();
  await page.setViewport({width: 640, height: 360, deviceScaleFactor: 1});
  await page.setContent('<body style="margin:0;background:linear-gradient(135deg,#0b1a2b,#4a7c9b)"><canvas id=c></canvas><script>const g=document.getElementById("c").getContext("webgl2");window.r=!!g;</script></body>');
  console.log('webgl2:', await page.evaluate('window.r'));
  await page.screenshot({path: '/tmp/shot.png'});
  console.log('version', await browser.version());
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

import { createClient } from '@supabase/supabase-js'

const allowCors = fn => async(req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST')
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    )
    return await fn(req, res)
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const MessagingResponse = require('twilio').twiml.MessagingResponse;
const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');
const supabase = createClient('<SupabaseUrl>', '<SupabaseToken>')

module.exports = allowCors(async(req, res) => {
    console.log(req.body)
    let resultquery = await supabase.from("users").select("board").eq("phone", req.body.WaId)


    const word = req.body.Body
    const browser = await puppeteer.launch({
        args: chrome.args,
        executablePath: await chrome.executablePath,
        headless: chrome.headless
    });

    const page = await browser.newPage();
    page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.82 Safari/537.36')
    await page.goto('https://wordle.danielfrg.com/');
    await page.waitForSelector('#__next > div.dark\\:bg-dark.dark\\:text-neutral-100.min-h-full > div > div button')
    console.log("here")
    for (let letter of word) {
        await page.evaluate((ch) => { document.querySelector("#__next > div.dark\\:bg-dark.dark\\:text-neutral-100.min-h-full > div > div").querySelector(`button[aria-label="${ch.toLowerCase()}"`).click() }, letter)
    }
    console.log("after for")
    await page.evaluate(() => { return JSON.stringify(localStorage) }).then((result) => { console.log(result) })
    await page.evaluate(() => { document.querySelector("#__next > div.dark\\:bg-dark.dark\\:text-neutral-100.min-h-full > div > div").querySelector('button[aria-label="procesar palabra"').click() })
    const twiml = new MessagingResponse();
    const inner = await page.evaluate(() => { return document.querySelector("#__next > div.dark\\:bg-dark.dark\\:text-neutral-100.min-h-full > div > main > div").innerText })
    console.log(inner)
    let fullresp = Array.from(await page.evaluate(() => {
        let rows = []
        let fullmsg = "";
        let allcells = document.querySelectorAll("#__next > div.dark\\:bg-dark.dark\\:text-neutral-100.min-h-full > div > main > div > div > div > div > div.react-card-back > div")

        for ([i, currel] of allcells.entries()) {
            console.log(currel)
            let bgcolor = window.getComputedStyle(currel).backgroundColor
            let emote = ""
            if (bgcolor == "rgba(0, 0, 0, 0)") {
                emote = "⬜"
            } else if (bgcolor == "rgb(201, 180, 88)") {
                emote = "🟨"
            } else if (bgcolor == "rgb(120, 124, 126)") {
                emote = "⬛"
            } else if (bgcolor == "rgb(106, 170, 100)") {
                emote = "🟩"
            }
            if (i % 5 === 0 && i != 0) {
                rows.push(fullmsg)
                fullmsg = ""
            }
            fullmsg += emote + " "

        }
        return rows;
    }))
    var boardarr
    if (resultquery.length > 0) {
        boardarr = resultquery.body[0].board[0]
        for (let row in boardarr) {
            if (boardarr[row][0] == "⬜" && fullresp[row][0] != "⬜") {
                boardarr[row][0] = fullresp[row];
                break;
            }
        }

        supabase.from("users").insert({
            board: JSON.stringify(boardarr)
        }).eq("phone", req.body.WaId)

    } else {
        boardarr = fullresp
        supabase.from("users").insert({
            phone: req.body.WaId,
            board: JSON.stringify(boardarr)
        })
    }
    console.log(boardarr);
    twiml.message(boardarr);

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    return res.end(twiml.toString());
});
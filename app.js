const cheerio = require('cheerio');
const download = require('image-downloader')
const fs = require('fs');
const request = require("request-promise");
const performance = require('perf_hooks').performance;
const Promise = require('bluebird')

request({
    url: 'https://slackmojis.com/',
    json: false
}).then(body => {
    const $ = cheerio.load(body);

    let emojis = []
    $('ul.groups').find('li.group').each(function(index){
        let folder = $( this ).find('div.title').text().trim().replace(/\./g,' ')

        $( this ).find('ul.emojis').children('li').each(function(index){
            let url = $( this ).find('a').attr('href').split('?')[0]
            emojis.push({
                url: 'https://slackmojis.com'+url,
                dest: "Emojis/" + folder
            })
        })
    })

    let start = performance.now();
    if (!fs.existsSync('emojis')) fs.mkdirSync('emojis')
    return Promise.mapSeries(emojis, emoji => {
        if (!fs.existsSync(emoji.dest)) fs.mkdirSync(emoji.dest)
        return download.image(emoji)
            .then(({ filename }) => {
                console.log('File saved to', filename)
            })
            .catch((err) => {
                console.error(err)
            })
    }).finally(function() {
        let end = performance.now();
        console.log("Downloaded " + emojis.length + " emojis in " + ( (end-start) / 1000).toFixed(2) + " seconds.")
    })    
})

# slackmojis-dl

Downloads all emojis from https://slackmojis.com/

## Usage

```
git clone https://github.com/ethanfann/slackmojis-dl
cd slackmojis-dl
npm install && npm start
```

![](media/demo.jpg)

### Note

Emojis already found within the `emojis/` directory won't be downloaded again on subsequent runs. For a fresh download, delete the `emojis/` directory.

## Organization

```
emojis
|
|-- Cat Emojis
|    |
|    |-- angry_cat.png
|    |-- anguished_cat.png
|    ...
|
|-- Facebook Reaction
|    |
|    |-- fb-angry.gif
|    |-- fb-heart.gif
|    ...
|
|  ...
```

## Further Usage

These can then be uploaded to Slack manually or with an extension such as [Neutral Face Emoji Tools](https://chrome.google.com/webstore/detail/neutral-face-emoji-tools/anchoacphlfbdomdlomnbbfhcmcdmjej?hl=en) to drag-and-drop an entire folder.

require('babel-polyfill')
const fs = require('fs')
const Axios = require('axios')
const cheerio = require('cheerio')
const textMiner = require('text-miner')
const natural = require('natural')
const nounInflector = new natural.NounInflector()
const verbInflector = new natural.PresentVerbInflector()
const WordPOS = require('wordpos'), wordpos = new WordPOS({stopwords: true})
const TfIdf = natural.TfIdf
let totalCount = -1

const category = 16

const siteUrl = `https://www.taiwannews.com.tw/news/pagination/category?offset=0&paginate=30&cate=${category}`

const getPostById = async (id) => {
	const { data } = await Axios.get(`https://www.taiwannews.com.tw/en/news/${id}`)
	const $ = cheerio.load(data)
	const text = $('.container-fluid.article').text()
	return text
}

const getTypes = (stem) => {
	return new Promise((resolve, reject) => {
		wordpos.getPOS(stem, resolve)
	})
}

const parseText = async (word) => {
	const miner = new textMiner.Corpus([word])
		.clean()
		.trim()
		.removeDigits()
		.toLower()
		.removeInvalidCharacters()
		.removeInterpunctuation()
	const texts = miner.documents[0].text
	const tokenizer = new natural.AggressiveTokenizer()
	const words = tokenizer.tokenize(texts)
	let data = {}
	for (let i in words) {
		const text = words[i]
		let stem = verbInflector.pluralize(text)
		stem = nounInflector.singularize(stem)
		const type = await getTypes(stem)
		// type.nouns.length > 0 || type.verbs.length > 0
		if (type.nouns.length > 0) {
			// natural.PorterStemmer.stem(text)
			if (data[stem]) {
				data[stem] ++;
			} else {
				data[stem] = 1;
			}
		}
	}
	// console.log(data)
	return data
}

const tfPar = (string, tfidf, data) => {
	return new Promise((resolve, reject) => {
		tfidf.tfidfs(string, (index, measure) => {
			// console.log(index, measure)
			if (data[string]) {
				data[string] += measure;
			} else {
				data[string] = measure;
			}
			if (index >= totalCount) {
				resolve()
			}
		})
	})
}

const analytic = async (word, tfidf, data = {}) => {
	for (let i in word) {
		await tfPar(i, tfidf, data)
	}
	return data
}

const main = async () => {
	const tfidf = new TfIdf()
	let keyText = {}
	let allData = {}
	const { data } = await Axios.get(`${siteUrl}`)
	for (let i in data.data) {
		let word = await getPostById(data.data[i].id)
		totalCount ++
		tfidf.addDocument(word)
		let parsedText = await parseText(word)
		Object.assign(keyText, parsedText)
	}
	console.log(Object.keys(keyText).length)
	allData = await analytic(keyText, tfidf, allData)
	// console.log(allData)
	let sortable = [];
	for (var index in allData) {
			sortable.push([index, allData[index]]);
	}

	sortable.sort(function(a, b) {
			return b[1] - a[1];
	});
	console.log(sortable)
	var file = fs.createWriteStream('result.txt');
	file.on('error', function(err) { /* error handling */ });
	sortable.forEach(function(v) { file.write(v.join(', ') + '\n'); });
	file.end();
}

main()
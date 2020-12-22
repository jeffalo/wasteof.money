const express = require('express')
const ejs = require('ejs')
const marked = require('marked')
const matter = require('gray-matter');

var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')
var bcrypt = require('bcrypt')
const fs = require('fs')
const path = require('path');

const jdenticon = require("jdenticon")

require('dotenv').config()

const port = process.env.LISTEN_PORT || 8080
const app = express()

const db = require('monk')(process.env.DB_URL)

//database
const users = db.get('users')
const posts = db.get('posts')

users.createIndex('name', { unique: true })

var saltRounds = 10

var tokens = []

const usernameRegex = /^[a-z0-9_\-]{1,20}$/

app.use(express.static('static', {
    extensions: ['html', 'htm']
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json())
app.use(cookieParser())

app.use(function (req, res, next) {
    if (req.url == '/') return next()
    if (req.url.slice(-1) == '/') {
        res.redirect(req.url.slice(0, -1))
    } else {
        next()
    }
})


app.use(async (req, res, next) => {
    var userCookie = req.cookies.token
    var user = findUser(userCookie)
    if (user) {
        res.locals.requester = await findUserDataByID(user.id)
        if(res.locals.requester){
            res.locals.loggedIn = true
        } else {
            res.locals.loggedIn = false // the account was deleted but token remains
            tokens = tokens.filter((obj) => { // clear that user from the tokens list (just keeping this cleaner)
                return obj.token !== userCookie;
            });
            console.log(tokens)
        }
    } else {
        res.locals.loggedIn = false
    }
    next()
})

app.get('/', function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn

    ejs.renderFile(__dirname + '/pages/index.ejs', { user, loggedIn }, (err, str) => {
        if (err) console.log(err)
        res.send(str)
    })
})

//docs

app.get('/docs/:page', async (req, res, next) => {
    let docarray = []

    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn

    var page = path.basename(req.params.page);
    fs.readdir('./docs/', async (err, files) => {
        for (var i in files) {
            var post = await fs.promises.readFile(`./docs/${files[i]}`, 'utf-8')
            mattereddata = matter(post)
            mattereddata.data.url = files[i].replace('.md', '')

            docarray.push(mattereddata)
        }
        try {
            var post = await fs.promises.readFile(`./docs/${page}.md`, 'utf-8')
            const mattered = matter(post)

            const html = marked(mattered.content);

            mattered.data.url = page

            var doc = {
                meta: mattered.data,
                body: html
            }

            ejs.renderFile(__dirname + '/pages/docs.ejs', { user, loggedIn, doc, docarray }, (err, str) => {
                if (err) console.log(err)
                res.send(str)
            })

        }
        catch (err) {
            if (err.code === 'ENOENT') {
                next()
            } else {
                throw err;
            }
        }

    })

})
app.get('/login', function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn

    if (!loggedIn) {
        ejs.renderFile(__dirname + '/pages/login.ejs', { user, loggedIn }, (err, str) => {
            if (err) console.log(err)
            res.send(str)
        })
    } else {
        res.redirect('/')
    }

});




app.get('/join', function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn

    if (!loggedIn) {
        ejs.renderFile(__dirname + '/pages/join.ejs', { user, loggedIn }, (err, str) => {
            if (err) console.log(err)
            res.send(str)
        })
    } else {
        res.redirect('/')
    }

})

app.get('/logout', function (req, res) {
    var userCookie = req.cookies.token
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn

    if (loggedIn) {
        tokens = tokens.filter((obj) => {
            return obj.token !== userCookie;
        });
        res.cookie('token', '')
        res.redirect('/')
    } else {
        res.redirect('/')
    }

})

app.post('/login', async function (req, res) {
    var loggedIn = res.locals.loggedIn
    if (req.is('application/json')) {
        if (!loggedIn) {
            var username = req.body.username.toLowerCase()
            var password = req.body.password
            const user = await findUserData(username)

            if (user) {
                bcrypt.compare(password, user.password, function (err, result) {
                    if (result) {
                        var token = makeID(20)
                        tokens.push({ id: user._id, token: token })
                        res.cookie('token', token)
                        res.json({ ok: 'Logged in successfully!' })
                    } else {
                        //password was incorrect
                        res.status(401).json({ error: 'incorrect password' })
                    }
                });
            } else {
                res.status(404).json({ error: 'user not found' }) // aparently this is bad practice https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Authentication_Cheat_Sheet.md#authentication-and-error-messages
            }
        } else {
            res.redirect('/')
        }
    } else {
        res.status(415).json({ error: 'must send json data' })
    }
})

app.post('/join', async function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn
    if (req.is('application/json')) {
        if (!loggedIn) {
            var username = req.body.username.toLowerCase()
            var password = req.body.password
            bcrypt.hash(password, saltRounds, async function (err, hashedPassword) {
                if (err) {
                    console.log(err)
                    res.status(500).json({ error: 'password hashing error' })
                } else {
                    if (usernameRegex.test(username)) {//check if username matches criteria
                        users.insert({
                            name: username,
                            password: hashedPassword,
                            followers: [],
                            messages: {
                                unread: [],
                                read: []
                            },
                        })
                            .then(user => {
                                console.log(user)
                                var token = makeID(20)
                                tokens.push({ id: user._id, token: token })
                                res.cookie('token', token)
                                res.json({ ok: 'made account successfully' })
                            })
                            .catch(err => {
                                if (err.code == 11000) {
                                    res.status(409).json({ error: 'username already taken' })
                                } else {
                                    console.log(err)
                                    res.status(500).json({ error: 'uncaught database error: ' + err.code }) // todo: don't do this on prod.
                                }
                            })
                    } else {//username does not match criterai
                        res.status(422).json({ error: `must match regex ${usernameRegex.toString()}` })
                    }
                }
            });
        } else {
            res.redirect('/')
        }
    } else {
        res.status(415).json({ error: 'must be json' })
    }
})

app.post('/update-username', async (req, res) => {
    var userCookie = req.cookies.token

    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn
    var username = req.body.username
    if (loggedIn && req.is('application/json')) {
        if (usernameRegex.test(username)) {
            try {
                await users.update({ _id: user._id }, { $set: { name: username } })
                tokens = tokens.filter((obj) => {
                    return obj.token !== userCookie;
                });
                res.cookie('token', '')
                res.json({ ok: username })
            } catch (err) {
                if (err.code == 11000) {
                    res.status(409).json({ error: 'username already taken' })
                } else {
                    console.log(err)
                    res.status(500).json({ error: 'uncaught database error: ' + err.code }) // todo: don't do this on prod.
                }
            }
        } else {
            res.status(422).json({ error: `must match regex ${usernameRegex.toString()}` })
        }
    } else {
        res.status(403).json({ error: 'not logged in, or not made with xhr' }) // is this the right status?
    }
})

app.post('/delete-account', async (req, res) => {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn

    if (loggedIn && req.xhr && user) {
        res.status(501).json({ error: 'account deletion is not implemented yet' })
    } else {
        res.status(403).json({ error: 'not logged in, not requested with xhr or no user found' }) // seperate this thing up
    }
})

app.get('/explore', async function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn

    if (loggedIn) {
        // logged in, show posts by people user is following etc
        ejs.renderFile(__dirname + '/pages/explore.ejs', { user, loggedIn }, (err, str) => {
            if (err) console.log(err)
            res.send(str)
        })
    } else {
        //logged out explore page, show trending posts etc
        ejs.renderFile(__dirname + '/pages/explore.ejs', { user, loggedIn }, (err, str) => {
            if (err) console.log(err)
            res.send(str)
        })
    }
})
app.get('/settings', async function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn

    if (loggedIn) {
        // logged in settings page
        ejs.renderFile(__dirname + '/pages/settings.ejs', { user, loggedIn }, (err, str) => {
            if (err) console.log(err)
            res.send(str)
        })
    } else {
        //logged out settings page, redirect
        res.redirect('/')

    }
})


app.get('/api/messages', async (req, res) => {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn
    var page = parseInt(req.query.page) || 1

    if (loggedIn) {
        var unread = user.messages.unread // don't paginate unread messages? 
        var read = paginate(user.messages.read, 15, page)
        var last = false
        if (paginate(user.messages.read, 15, page + 1).length == 0) last = true //set last to true if this is the last page
        console.log(read)
        var messages = {
            unread,
            read,
            last
        }
        messages.unread = messages.unread.sort(function (x, y) {
            return y.time - x.time;
        })
        messages.read = messages.read.sort(function (x, y) {
            return y.time - x.time;
        })
        res.json(messages)
    } else {
        res.status(401).json({ error: 'requires login' })
    }
})

app.get('/api/messages/count', async (req, res) => {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn
    if (loggedIn) {
        var messages = user.messages
        res.json({ count: messages.unread.length })
    } else {
        res.status(401).json({ error: 'requires login' })
    }
})

app.post('/api/messages/read', async (req, res) => {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn

    if (req.xhr) {
        if (loggedIn) {
            var messages = user.messages
            messages.read = messages.read.concat(messages.unread)
            messages.unread = []
            try {
                await users.update({ name: user.name }, { $set: { messages } })
                res.json({ ok: 'cleared messages' })
            } catch (error) {
                console.log(error)
                res.status(500).json({ error: 'uncaught server error' })
            }
        } else {
            res.status(401).json({ error: 'requires login' })
        }
    } else {
        res.status(403).json({ error: 'must be requested with xhr' })
    }
})

app.get('/messages', async (req, res) => {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn
    if (loggedIn) {
        ejs.renderFile(__dirname + '/pages/messages.ejs', { user, loggedIn }, (err, str) => {
            if (err) console.log(err)
            res.send(str)
        })
    } else {
        res.redirect('/login')
    }
})

app.get('/users', function (req, res) {
    users.find({}).then((docs) => {
        var userList = []
        docs.forEach(i => {
            userList.push({ name: i.name })
        })
        res.json(userList)
    })
})

app.get('/api/users/:user', async (req, res) => {
    var user = await findUserData(req.params.user)
    if (user) {
        res.json({
            _id: user._id,
            name: user.name,
            followers: user.followers.length
        })
    } else {
        res.status(404).json({ error: 'no user found' })
    }
})

//TODO: user follower api

app.get('/api/users/:user/posts', async (req, res) => {
    var user = await findUserData(req.params.user)
    var userPosts = await posts.find({ poster: user._id }, { sort: { time: -1, _id: -1 } }) //sort by time but fallback to id

    for (var i in userPosts) {
        var poster = await findUserDataByID(userPosts[i].poster)
        userPosts[i].poster = poster.name // this is inefficent, we know the user will always be the smae, but hopefully mongodb is fast so this won't be an issue
    }

    var page = parseInt(req.query.page) || 1
    if (user) {
        var pagePosts = paginate(userPosts, 15, page)
        var last = false
        if (paginate(userPosts, 15, page + 1).length == 0) last = true //set last to true if this is the last page
        res.json({ posts: pagePosts, last })
    } else {
        res.status(404).json({ error: 'no user found' })
    }
})

app.get('/api/users/:user/posts/:post', async (req, res) => {
    res.redirect(`/api/posts/${req.params.post}`)
})

app.get('/users/:user', async function (req, res, next) {
    var loggedInUser = res.locals.requester
    var loggedIn = res.locals.loggedIn

    var user = await findUserData(req.params.user)

    if (user) {
        ejs.renderFile(__dirname + '/pages/user.ejs', { user, loggedInUser, loggedIn }, (err, str) => {
            if (err) console.log(err)
            res.send(str)
        })
    } else {
        next() //go to 404
    }
})

app.get('/picture/:user', async function (req, res, next) {
    if (fs.existsSync(`./uploads/profiles/${req.params.user}.png`)) {
        res.sendFile(__dirname + `/uploads/profiles/${req.params.user}.png`)
    } else {
        var file = jdenticon.toPng(req.params.user, 128)
        res.set('Content-Type', 'image/png')
        res.send(file)
    }
})

app.get('/api/posts/:post', async function (req, res) {
    try {
        var post = await posts.findOne({ _id: req.params.post })
        var poster = await findUserDataByID(post.poster)
        post.poster = poster.name
        res.json(post)
    } catch {
        res.status(404).json({ error: 'no post found' })
    }
})

app.get('/posts/:post', async function (req, res, next) {
    try {
        var post = await posts.findOne({ _id: req.params.post })
        var poster = await findUserDataByID(post.poster)
        res.redirect(`/users/${poster.name}?post=${post._id}`)
    } catch {
        next() //404
    }
})

app.post('/post', async function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn
    if (req.is('application/json')) {
        if (loggedIn) {
            posts.insert({ content: req.body.post, poster: user._id, time: Date.now(), loves: [] })
                .then(post => {
                    res.json({ ok: 'made post', id: post._id })
                })
                .catch(err => {
                    res.status(500).json({ error: 'uncaught server error' })
                    console.error(error)
                })
        } else {
            res.status(401).json({ error: 'must be logged in' })
        }
    } else {
        res.status(415).json({ error: 'must send json data' })
    }
})

app.post('/posts/:id/love', async function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn
    if (req.xhr) {
        if (loggedIn) {
            try {
                posts.findOne({ _id: req.params.id })
                    .then(post => {
                        if (post) {
                            var loves = post.loves || []
                            if (!loves.includes(user._id.toString())) {
                                loves.push(user._id.toString())
                                posts.update({ _id: req.params.id }, { $set: { loves: loves } })
                                    .then(() => {
                                        res.json({ ok: 'loved post', new: loves, action: 'love' })
                                    })
                                    .catch(updateerr => {
                                        console.log(updateerr)
                                        res.status(500).json({ error: 'uncaught database error: ' + updateerr.code }) // todo: don't do this on prod.
                                    })
                            } else {
                                loves = loves.filter(i => i !== user._id.toString())
                                posts.update({ _id: req.params.id }, { $set: { loves: loves } })
                                    .then(() => {
                                        res.json({ ok: 'unloved', new: loves, action: 'unlove' })
                                    })
                                    .catch(updateerr => {
                                        console.log(updateerr)
                                        res.status(500).json({ error: 'uncaught database error: ' + updateerr.code }) // todo: don't do this on prod.
                                    })
                            }
                        } else {
                            res.json({ eror: 'post not found' })
                        }
                    })
                    .catch(err => {
                        res.status(500).json({ error: 'uncaught database error: ' + err.code }) // todo: don't do this on prod.
                    })
            } catch (error) {
                console.log(error)
                res.status(500).json({ error: 'oops something went wrong' })
            }
        } else {
            res.status(401).json({ error: 'needs to be logged in' })
        }
    } else {
        res.status(403).json({ error: 'must be requested with xhr' })
    }
})

app.post('/users/:name/follow', async function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn
    if (req.xhr) {
        if (loggedIn) {
            var followUser = await findUserData(req.params.name)
            if (followUser) {
                var followers = followUser.followers || []
                if (followers.includes(user._id.toString())) { //already follower, unfollow
                    followers = followers.filter(i => i !== user._id.toString())
                    try {
                        await users.update({ name: followUser.name }, { $set: { followers } })
                        res.json({ ok: 'unfollowing', action: 'unfollow', new: followers.length })
                    }
                    catch (error) {
                        console.log(error)
                        res.status(500).json({ error: 'uncaught database error: ' + error.code }) // todo: don't do this on prod.
                    }
                } else { //follow
                    try {
                        await users.update({ name: followUser.name }, { $push: { followers: user._id.toString() } })
                        addMessage(followUser.name, `<a href='/users/${user.name}'>@${user.name}</a> is now following you.`)
                        res.json({ ok: 'now following', action: 'follow', new: followers.length + 1 })
                    }
                    catch (error) {
                        console.log(error)
                        res.status(500).json({ error: 'uncaught database error: ' + error.code }) // todo: don't do this on prod.
                    }
                }
            } else {
                res.status(404).json({ error: 'no user found' })
            }
        } else {
            res.status(401).json({ error: 'needs to be logged in' })
        }
    } else {
        res.status(403).json({ error: 'must be requested with xhr' })
    }
})

app.use((req, res, next) => { // 404 page always last
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn
    res.status(404).send(ejs.renderFile(__dirname + '/pages/404.ejs', { user, loggedIn }, (err, str) => {
        if (err) console.log(err)
        res.send(str)
    }))
})

function findUser(token) {
    var user = tokens.find(t => t.token == token)
    return user
}

function findUserData(name) {
    var regexName = "^" + name + "$"
    return new Promise(async (resolve, reject) => {
        try {
            var user = await users.findOne({ name: { $regex: new RegExp(regexName, "i") } });
            resolve(user)
        } catch (error) {
            reject(Error(error))
        }
    })
}

function findUserDataByID(id) {
    return new Promise(async (resolve, reject) => {
        try {
            var user = await users.findOne({ _id: id });
            resolve(user)
        } catch (error) {
            reject(Error(error))
        }
    })
}

function addMessage(name, text, time = Date.now()) {
    return new Promise(async (resolve, reject) => {
        try {
            var user = await findUserData(name)
            var messages = user.messages

            messages.unread.push({
                content: text,
                time
            })
            var update = await users.update({ name: name }, { $set: { messages } })
            resolve(update)
        } catch (error) {
            reject(Error(error))
        }
    })
}

function makeID(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function paginate(array, page_size, page_number) {
    // human-readable page numbers usually start with 1, so we reduce 1 in the first argument
    return array.slice((page_number - 1) * page_size, page_number * page_size);
}

app.listen(port, () => {
    console.log(`listening on http://localhost:${port}`)
});

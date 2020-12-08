const express = require('express')
const ejs = require('ejs')
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var bcrypt = require('bcrypt');
const fs = require('fs')
const jdenticon = require("jdenticon");

const port = process.env.LISTEN_PORT || 8080
const app = express()

require('dotenv').config()
const db = require('monk')(process.env.DB_URL)

//database
const users = db.get('users')
const posts = db.get('posts')

users.createIndex('name', { unique: true })

var saltRounds = 10

var tokens = []

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
        res.locals.requester = await findUserData(user.username)
        res.locals.loggedIn = true
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

})

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

    if (!loggedIn) {
        var username = req.body.username.toLowerCase()
        var password = req.body.password
        const user = await findUserData(username)

        if (user) {
            bcrypt.compare(password, user.password, function (err, result) {
                if (result) {
                    var token = makeID(20)
                    tokens.push({ username: user.name, token: token })
                    res.cookie('token', token)
                    res.json({ ok: 'logged in successfully' })
                } else {
                    //password was incorrect
                    res.json({ error: 'incorrect password' })
                }
            });
        } else {
            res.json({ error: 'user not found' })
        }
    } else {
        res.redirect('/')
    }
})

app.post('/join', async function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn

    if (!loggedIn) {
        var username = req.body.username.toLowerCase()
        var password = req.body.password
        bcrypt.hash(password, saltRounds, async function (err, hashedPassword) {
            if (err) {
                res.json({ error: 'password hashing error' })
            } else {
                if (/^[a-z0-9_\-.]{1,20}$/.test(username)) {//check if username matches criteria
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
                            tokens.push({ username: user.name, token: token })
                            res.cookie('token', token)
                            res.json({ ok: 'made account successfully' })
                        })
                        .catch(err => {
                            if (err.code == 11000) {
                                res.json({ error: 'username already taken' })
                            } else {
                                console.log(err)
                                res.json({ error: 'uncaught database error: ' + err.code })
                            }
                        })
                } else {//username does not match criterai
                    res.json({ error: 'must match regex /^[a-z0-9_\-.]{1,20}$/' })
                }
            }
        });
    } else {
        res.redirect('/')
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
        res.json({ error: 'requires login' })
    }
})

app.get('/api/messages/count', async (req, res) => {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn
    if (loggedIn) {
        var messages = user.messages
        res.json({ count: messages.unread.length })
    } else {
        res.json({ error: 'requires login' })
    }
})

app.post('/api/messages/read', async (req, res) => {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn
    if (loggedIn) {
        var messages = user.messages
        messages.read = messages.read.concat(messages.unread)
        messages.unread = []
        try {
            await users.update({ name: user.name }, { $set: { messages } })
            res.json({ ok: 'cleared messages' })
        } catch (error) {
            console.log(error)
            res.json({ error: 'something went wrong' })
        }
    } else {
        res.json({ error: 'requires login' })
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
        res.json({ error: 'no user found' })
    }
})

//TODO: user follower api

app.get('/api/users/:user/posts', async (req, res) => {
    var user = await findUserData(req.params.user)
    var userPosts = await posts.find({ poster: req.params.user }, { sort: { time: -1, _id: -1 } }) //sort by time but fallback to id
    var page = parseInt(req.query.page) || 1
    if (user) {
        var pagePosts = paginate(userPosts, 15, page)
        var last = false
        if (paginate(userPosts, 15, page + 1).length == 0) last = true //set last to true if this is the last page
        res.json({ posts: pagePosts, last })
    } else {
        res.json({ error: 'no user found' })
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
        res.json(post)
    } catch {
        res.json({ error: 'no post found' })
    }
})

app.get('/posts/:post', async function (req, res, next) {
    try {
        var post = await posts.findOne({ _id: req.params.post })
        res.redirect(`/users/${post.poster}?post=${post._id}`)
    } catch {
        next() //404
    }
})

app.post('/post', async function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn

    if (loggedIn) {
        posts.insert({ content: req.body.post, poster: user.name, time: Date.now(), loves: [] })
            .then(post => {
                res.json({ ok: 'made post', id: post._id })
            })
            .catch(err => {
                res.json({ error: 'uncaught error' })
                console.error(error)
            })
    } else {
        res.json({ error: 'must be logged in' })
    }
})

app.post('/posts/:id/love', async function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn

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
                                    res.json({ error: updateerr })
                                })
                        } else {
                            loves = loves.filter(i => i !== user._id.toString())
                            posts.update({ _id: req.params.id }, { $set: { loves: loves } })
                                .then(() => {
                                    res.json({ ok: 'unloved', new: loves, action: 'unlove' })
                                })
                                .catch(updateerr => {
                                    console.log(updateerr)
                                    res.json({ error: updateerr })
                                })
                        }
                    } else {
                        res.json({ eror: 'post not found' })
                    }
                })
                .catch(err => {
                    res.json({ error: err.code })
                })
        } catch (error) {
            console.log(error)
            res.json({ error: 'oops something went wrong' })
        }
    } else {
        res.json({ error: 'needs to be logged in' })
    }
})

app.post('/users/:name/follow', async function (req, res) {
    var user = res.locals.requester
    var loggedIn = res.locals.loggedIn
    if (loggedIn) {
        var followUser = await findUserData(req.params.name)
        var followers = followUser.followers || []
        if (followers.includes(user._id.toString())) { //already follower, unfollow
            followers = followers.filter(i => i !== user._id.toString())
            try {
                await users.update({ name: followUser.name }, { $set: { followers } })
                res.json({ ok: 'unfollowing', action: 'unfollow', new: followers.length })
            }
            catch (error) {
                console.log(error)
                res.json({ error: 'database error' })
            }
        } else { //follow
            try {
                await users.update({ name: followUser.name }, { $push: { followers: user._id.toString() } })
                addMessage(followUser.name, `<a class='text-indigo-600' href='/users/${user.name}'>@${user.name}</a> is now following you.`)
                res.json({ ok: 'now following', action: 'follow', new: followers.length + 1 })
            }
            catch (error) {
                console.log(error)
                res.json({ error: 'database error' })
            }
        }
    } else {
        res.json({ error: 'needs to be logged in' })
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

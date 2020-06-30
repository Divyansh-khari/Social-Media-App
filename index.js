const express = require('express')
const path = require('path')
const PORT = process.env.PORT || 5000

const multer = require('multer')

const storage = multer.diskStorage({
  destination: (req, file, func) => {
    func(null, './pictures/')
  },
  filename: (req, file, func) => {
    func(null, file.originalname)
  }
})

const http = require('http').Server(express())
const io = require('socket.io');
const socket = io(http);

const pictures = multer({storage: storage})

const {Pool} = require('pg');
var pool;
pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:root@localhost/appdatabase'
})

app = express()

  app.use(express.json())
  app.use(express.urlencoded({extended:false}))
  app.use(express.static(path.join(__dirname, 'public')))
  app.use('/pictures', express.static('pictures'))
  app.set('views', path.join(__dirname, 'views'))
  app.set('view engine', 'ejs')
  app.get('/', (req, res) => res.render('pages/index'))
  app.get('/myPage', (req, res) => {
    res.render('pages/userHomepage')
  })

  app.get('/profile', (req, res) => {
    var allQuery = 'select * from users'
    pool.query(allQuery, (error, result) => {
      if (error)
        res.end(error)
      var data = {'theUser': result.rows[0]}

      res.render('pages/profile', data)
    })


  })

  app.post('/pictureChoose', pictures.single('profilePicture'), (req, res) => {

    var pictureUpdate = `update users set profilePicture = '${req.file.path}' where uid = 1`

    pool.query(pictureUpdate, (error, result) => {
      if (error)
        res.end(error)
    })


    setTimeout(function(){res.redirect('/profile')}, 50)

  })

  app.post('/usernameChange', (req, res) => {

    console.log(req.body)

    var usernameChange = `update users set username = '${req.body.uname}' where uid = 1`

    pool.query(usernameChange, (error, result) => {
      if(error)
        res.end(error)
    })

    res.redirect('/profile')
  })


  app.get('/chat', (req,res)=>{
    res.render('pages/chat');
  })


  .listen(PORT, () => console.log(`Listening on ${ PORT }`))

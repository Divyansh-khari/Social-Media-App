const express = require('express')
const session = require('express-session')
const bodyParser = require('body-parser')
const path = require('path')
const PORT = process.env.PORT || 5000
const multer = require('multer')
var cors = require('cors')
const googleConfig = {
  clientId: '279562630685-3hv4pg7a5vm45s9rpgph0e6vv07943pn.apps.googleusercontent.com',
  clientSecret: 'FzuBw_NZ1_WS_7vrLcJvfJj9',
  redirect: 'https://museical.herokuapp.com'
};

const fs = require('fs')

const google = require('googleapis').google;
const jwt = require('jsonwebtoken');
const CONFIG = require('./config');
// Google's OAuth2 client
const OAuth2 = google.auth.OAuth2;
// Allowing ourselves to use cookies
const cookieParser = require('cookie-parser');
const _ = require("underscore");


require('dotenv').config();

/**
* Create the google auth object which gives us access to talk to google's apis.
 */
function createConnection() {
  return new google.auth.OAuth2(
    googleConfig.clientId,
    googleConfig.clientSecret,
    googleConfig.redirect
  );
}

const defaultScope = [
  'https://www.googleapis.com/auth/plus.me',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Get a url which will open the google sign-in page and request access to the scope provided
 */
function getConnectionUrl(auth) {
  return auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: defaultScope
  });
}

/**
 * Create the google url to be sent to the client.
 */
function urlGoogle() {
  const auth = createConnection();
  const url = getConnectionUrl(auth);
  return url;
}


// Storgae destination for profile pictures, and the name of the picture.
const storage = multer.diskStorage({
  destination: (req, file, func) => {
    func(null, './pictures/')
  },
  filename: (req, file, func) => {
    func(null, `id${req.session.loggedID}` )
  }
})


// Only allowing jpeg or png files for profile pictures.
const fileFilter = (req, file, func) => {
  if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg'){
    func(null, true)
  }
  else {
    func(null, false)
  }
}

// Adding the features outlined above to the multer object.
const pictures = multer({storage: storage, fileFilter: fileFilter})

const {Pool} = require('pg');
var pool;
pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:root@localhost/appdatabase'
})

checkLogin = (req, res, next) => {
  if(req.session.loggedin){
    next()
  }
  else {
    res.redirect('/' + '?valid=log')
  }
}

app = express()

//setup for socket.io
const http = require('http').Server(express())
const server = app.listen(PORT, () => console.log(`Listening on ${ PORT }`))
const io = require('socket.io').listen(server);

// Spotify set up

var SpotifyWebApi = require('spotify-web-api-node');
const { create } = require('domain')
const { promiseImpl } = require('ejs')
const { info } = require('console')

var scopes = ['user-top-read', 'user-read-currently-playing', 'user-read-recently-played', 'user-library-read']
var state = 'the_secret'

var SpotifyAPI = new SpotifyWebApi({
  clientId: '66ad16283b5f40c7a94c0b2af7485926',
  clientSecret: process.env.SPOTIFY_KEY,
  redirectUri: 'https://museical.herokuapp.com/spotifyAuth' //'http://localhost:5000/spotifyAuth'
});

var authorizeURL = SpotifyAPI.createAuthorizeURL(scopes, state)

  app.use(session({
    secret : 'theSecret',
    resave : true,
    saveUninitialized : true
  }))
  app.use(cookieParser());
  app.use(express.json())
  app.use(express.urlencoded({extended:false}))
  app.use(bodyParser.urlencoded({extended : true}))
  app.use(bodyParser.json())
  app.use(express.static(path.join(__dirname, 'public')))
  app.use('/pictures', express.static('pictures'))
  app.use('/', cors());
  app.set('views', path.join(__dirname, 'views'))
  app.set('view engine', 'ejs')


  // Takes you to the login page whenever the app is opened.
  app.get('/', (req, res) => res.render('pages/Login', {'alert' : req.query.valid}))

  // Takes you to the registration page when the user clicks register from the login page.
  app.get('/register', (req,res) => {
    res.render('pages/Register', {'alert' : req.query.error})
  })

  // The homepage for every user, customized to their personal info.
  app.get('/home', checkLogin, async (req, res) => {

    var user = {'username' : req.session.username}
    user.albumsYouMayLike = []
    user.relatedArtists = []
    user.hotRightNow = []
    user.myTracks = []
    user.myArtists = []
    var loadedIDs = []

    function theSongCheck(x){
      return new Promise(resolve => {

        var checkSongs = `select track_id from favouritetracks where user_id = ${req.session.loggedID}`

         pool.query(checkSongs, (error, result) => {
          if(error)
            res.send(error)

          result.rows.filter(function(each) {
            user.myTracks.push(each.track_id)
          })

          resolve(x);

          })
      })

    }

    function theArtistGet(user){
      return new Promise(resolve => {

        var artistsGet = `select artist_id from favouriteartists where user_id = ${req.session.loggedID}`

        pool.query(artistsGet, (error, result) => {
          if(error)
            res.send(error)

          if(result.rows.length == 0){
            user.myArtists = []
            resolve(user)

          } else {

            result.rows.filter(function(each) {
              user.myArtists.push(each.artist_id)
            })

            resolve(user)

            }
          })
      })

    }

    function relatedAlbums(user, index, max){
      return new Promise(resolve => {

          SpotifyAPI.getArtistAlbums(user.myArtists[index]).then(
            function(data) {
              if(data.body.items.length == 0){
                resolve(user)
              } else if(data.body.items.length == 1 | !max){
                  var theAlbum = {}
                  theAlbum.name = data.body.items[0].name
                  theAlbum.artists = data.body.items[0].artists
                  theAlbum.id = data.body.items[0].id

                  if(data.body.items[0].images.length == 0){
                    theAlbum.picture = false
                  } else {
                    theAlbum.picture = data.body.items[0].images[0].url
                  }
                  user.albumsYouMayLike.push(theAlbum)
                  resolve(user)
              } else{

                var theAlbum = {}
                theAlbum.name = data.body.items[0].name
                theAlbum.artists = data.body.items[0].artists
                theAlbum.id = data.body.items[0].id

                if(data.body.items[0].images.length == 0){
                  theAlbum.picture = false
                } else {
                  theAlbum.picture = data.body.items[0].images[0].url
                }
                user.albumsYouMayLike.push(theAlbum)

                var theAlbum = {}
                theAlbum.name = data.body.items[1].name
                theAlbum.artists = data.body.items[1].artists
                theAlbum.id = data.body.items[1].id

                if(data.body.items[1].images.length == 0){
                  theAlbum.picture = false
                } else {
                  theAlbum.picture = data.body.items[1].images[0].url
                }
                user.albumsYouMayLike.push(theAlbum)

                resolve(user)

              }


            },
            function(error) {
            res.send(error)
          });

      })
    }

    function relatedArtists(user, index, max){
      return new Promise(resolve => {

        SpotifyAPI.getArtistRelatedArtists(user.myArtists[index]).then(
          function(data) {
            if(data.body.artists.length == 0){
              resolve(user)
            } else if(data.body.artists.length == 1 | !max){

              var theArtist = {}
              theArtist.name = data.body.artists[0].name
              theArtist.id = data.body.artists[0].id

              theArtist.genres = data.body.artists[0].genres.map(x => x.replace(/(^\w|\s\w|\&\w)/g, (y) => { return y.toUpperCase()} ))

              if(data.body.artists[0].images.length == 0){
                theArtist.picture = false
              } else {
                theArtist.picture = data.body.artists[0].images[0].url
              }

              user.relatedArtists.push(theArtist)
              loadedIDs.push(`'${data.body.artists[0].id}'`)
              resolve(user)
            } else {

              var theArtist = {}
              theArtist.name = data.body.artists[0].name
              theArtist.id = data.body.artists[0].id

              theArtist.genres = data.body.artists[0].genres.map(x => x.replace(/(^\w|\s\w|\&\w)/g, (y) => { return y.toUpperCase()} ))

              if(data.body.artists[0].images.length == 0){
                theArtist.picture = false
              } else {
                theArtist.picture = data.body.artists[0].images[0].url
              }

              user.relatedArtists.push(theArtist)
              loadedIDs.push(`'${data.body.artists[0].id}'`)

              var theArtist = {}
              theArtist.name = data.body.artists[1].name
              theArtist.id = data.body.artists[1].id

              theArtist.genres = data.body.artists[1].genres.map(x => x.replace(/(^\w|\s\w|\&\w)/g, (y) => { return y.toUpperCase()} ))

              if(data.body.artists[1].images.length == 0){
                theArtist.picture = false
              } else {
                theArtist.picture = data.body.artists[1].images[0].url
              }

              user.relatedArtists.push(theArtist)
              loadedIDs.push(`'${data.body.artists[1].id}'`)
              resolve(user)
            }

          },
          function(error) {
          res.send(error)
        });

      })

    }

    function hotNow(user){
      return new Promise(resolve => {

        SpotifyAPI.getNewReleases({ limit : 10 }).then(
          function(data) {
            var recent = []
            var index = 0;
            for (each of data.body.albums.items) {
              if(each.name == "Spotify Singles"){
                continue
              } else if (index == 6){
                break
              } else {
                index += 1;
                var item = {}
                item.id = each.id
                item.name = each.name
                item.artists =  each.artists.map(a => a.name)
                item.type = each.album_type

                if(each.images.length){
                  item.picture = each.images[0].url
                } else {
                  item.picture = false
                }

                item.released = each.release_date
                user.hotRightNow.push(item)
                loadedIDs.push(`'${each.id}'`)
              }
            }

            resolve(user)

          },
          function(error) {
            res.send(error)
        })

      })
    }

    function done(try4){


      if(loadedIDs.length != 0){

        var gatherRatings = `select rating_target, avg(rating) from ratings where rating_target in (${loadedIDs}) group by rating_target`

        pool.query(gatherRatings, (error, result) => {
          if(error)
            res.send(error)

          var allRatings = result.rows.reduce(function(theDict, each) {
            theDict[each.rating_target] = Math.round(each.avg * 1e2)/ 1e2
            return theDict
          }, {})

          try4.allRatings = allRatings

          res.render('pages/userHomepage', try4 )

        })

      } else {
        try4.allRatings = []

        res.render('pages/userHomepage', try4 )
      }


    }

    var try1 = await theSongCheck(user);
    var try2 = await theArtistGet(try1);


    var try3;
    if(user.myArtists.length == 0){
      try3 = try2
    }
    else if(user.myArtists.length == 1){
      try3 = await relatedAlbums(try2, 0, true)
      try3 = await relatedArtists(try2, 0, true)
    } else {
      for(var index = 0; index < user.myArtists.length & index < 4; index++){
        try3 = await relatedAlbums(try2, index, false)
        try3 = await relatedArtists(try2, index, false)
      }
    }

    var try4 = await hotNow(try3)

    done(try4)



  })

  app.get('/notifications', checkLogin, (req, res) => {

    res.render('pages/notifications', {'username' : req.session.username, 'id' : req.session.loggedID})

  })

app.get('/admin', checkLogin, async (req,res) => {
  var adminCheck = `select * from users where id = ${req.session.loggedID} AND usertype='A';`
  await pool.query(adminCheck, (error, result) => {
    if(error)
        res.send(error)

    if(result.rows.length == 0){
      req.session.destroy()
      return res.redirect("/" + '?valid=accessDenied')
    } else {
      var insertQuery=`SELECT * FROM users ORDER BY ID ASC`;
      pool.query(insertQuery, (error, result) => {
        if(error)
          res.send(error)
        var results = {'rows':result.rows};
        res.render('pages/admin', results);
        });
      }
    })
  })

app.post('/userInfoUpdate', checkLogin, async (req, res) => {

  var userInfoUpdate = `update users set email = '${req.body.email}', password = '${req.body.password}'
    , usertype = '${req.body.usertype}' where id = ${req.body.id};`

  pool.query(userInfoUpdate, (error, result) => {
    if(error)
      res.send(error)

    res.redirect('/admin')
  })

})

  app.get('/mymusic', checkLogin, (req, res) => {
    if (!req.cookies.jwt) {
      // We haven't logged in
      return res.redirect('/google_login');
    }
    // Create an OAuth2 client object from the credentials in our config file
    const oauth2Client = new OAuth2(CONFIG.oauth2Credentials.client_id, CONFIG.oauth2Credentials.client_secret, CONFIG.oauth2Credentials.redirect_uris[0]);
    // Add this specific user's credentials to our OAuth2 client
    oauth2Client.credentials = jwt.verify(req.cookies.jwt, CONFIG.JWTsecret);
    // Get the youtube service
    const service = google.youtube('v3');
    // Get top 10 most popular music related videos
    Promise.all([
      service.videos.list({
        auth: oauth2Client,
        part: 'snippet',
        maxResults: 10,
        myRating: 'like',
        type: "video",
        videoCategoryId: "10"
      }),
    ]).then(response => {
      // Render the data view, passing the subscriptions to it
      return  res.render('pages/mymusic', { 'username' : req.session.username, 'id' : req.session.loggedID, likedVids: response[0].data.items });
    });
  });

app.get('/maps', (req, res) => res.render('pages/Maps', {'alert' : req.query.valid}))
app.get('/news', (req, res) => res.render('pages/news', {'alert' : req.query.valid}))
  app.get('/videos', checkLogin, (req, res) => {
    if (!req.cookies.jwt) {
      // We haven't logged in
      return res.redirect('/google_login');
    }
    // Create an OAuth2 client object from the credentials in our config file
    const oauth2Client = new OAuth2(CONFIG.oauth2Credentials.client_id, CONFIG.oauth2Credentials.client_secret, CONFIG.oauth2Credentials.redirect_uris[0]);
    // Add this specific user's credentials to our OAuth2 client
    oauth2Client.credentials = jwt.verify(req.cookies.jwt, CONFIG.JWTsecret);
    // Get the youtube service
    const service = google.youtube('v3');
    // Get top 10 most popular music related videos
    Promise.all([
      service.videos.list({
        auth: oauth2Client,
        part: 'snippet',
        maxResults: 10,
        chart:"mostPopular",
        regionCode: "US",
        type: "video",
        videoCategoryId: "10"
      }),
      service.videos.list({
        auth: oauth2Client,
        part: 'snippet',
        maxResults: 10,
        myRating: 'like',
        type: "video",
        videoCategoryId: "10"
      }),
    ]).then(response => {
      // Render the data view, passing the subscriptions to it
      return  res.render('pages/videos', { 'username' : req.session.username, 'id' : req.session.loggedID, popularVids: response[0].data.items, likedVids: response[1].data.items });
    });
  });

  app.post('/search', checkLogin, async (req, res) => {

    var current = {'username' : req.session.username}
    var loadedIDs = []

    if( req.body.searchInput == ""){
      current.results = []
      res.render('pages/resultsPage', current)
    }
    else {

      await SpotifyAPI.searchTracks(`'${req.body.searchInput}'`, {limit: 5}).then( (data, error) => {
        if(error){
          res.send(error)
        } else {
          var songs = []
          for (each of data.body.tracks.items){
            var song = {}
            song.name = each.name
            song.id = each.id
            song.artists = each.artists.map(a => a.name)

            if(each.album.images.length != 0){
              song.picture = each.album.images[0].url
            } else {
              song.picture = false
            }

            song.popularity = each.popularity
            songs.push(song)
            loadedIDs.push(`'${each.id}'`)
          }
          current.spotifySongs = songs
        }
      });

      await SpotifyAPI.searchArtists(`'${req.body.searchInput}'`, {limit: 5}).then( (data, error) => {
            if(error){
              res.send(error)
            } else {
              var artists = []
              for (each of data.body.artists.items){
                var artist = {}
                artist.name = each.name
                artist.id = each.id

                // This function takes each genre and capitalizes the first letters.
                artist.genres = each.genres.map(x => x.replace(/(^\w|\s\w|\&\w)/g, (y) => { return y.toUpperCase()} ))

                if(each.images.length){
                  artist.picture = each.images[0].url
                } else {
                  artist.picture = false
                }

                artist.popularity = each.popularity
                artists.push(artist)
                loadedIDs.push(`'${each.id}'`)
              }
              current.spotifyArtists = artists
            }

          });

        await SpotifyAPI.searchAlbums(`'${req.body.searchInput}'`, {limit: 5}).then( (data, error) => {
              if(error){
                res.send(error)
              } else {
                var albums = []
                for (each of data.body.albums.items){
                  var album = {}
                  album.name = each.name
                  album.id = each.id
                  album.artists = each.artists

                  if(each.images.length){
                    album.picture = each.images[0].url
                  } else {
                    album.picture = false
                  }

                  albums.push(album)

                }
                current.spotifyAlbums = albums
              }

            });


    if (!req.cookies.jwt) {
      current.youtubevideos = '/google_login'
    } else {
      var ytube;
      // Create an OAuth2 client object from the credentials in our config file
      const oauth2Client = new OAuth2(CONFIG.oauth2Credentials.client_id, CONFIG.oauth2Credentials.client_secret, CONFIG.oauth2Credentials.redirect_uris[0]);
      // Add this specific user's credentials to our OAuth2 client
      oauth2Client.credentials = jwt.verify(req.cookies.jwt, CONFIG.JWTsecret);
      // Get the youtube service
      const service = google.youtube('v3');
      // Get five of the user's subscriptions (the channels they're subscribed to)
      await service.search.list({
        auth: oauth2Client,
        part: 'snippet',
        maxResults: 25,
        q: req.body.searchInput,
        type: "video",
        videoCategoryId: "10"
      }).then(response => {
        // Render the data view, passing the subscriptions to it
        current.youtubevideos = response.data.items
      }).catch(error => {
        res.send(error)
      });
    }


      var input = `${req.body.searchInput}`
      var cleaned = input.replace(/'/g, "''")


      var searchQuery = `select * from users where username like '${cleaned}'`


      pool.query(searchQuery, (error, result) => {
        if(error)
          res.send(error)

        current.results = result.rows

        var checkFollowers = `select is_following from followers where the_user = ${req.session.loggedID} `

        pool.query(checkFollowers, (error, result) => {
          if(error)
            res.send(error)

          var followers = []

          result.rows.filter(function(each) {
            followers.push(each.is_following)
          })

          current.followers = followers

          var checkSongs = `select track_id from favouritetracks where user_id = ${req.session.loggedID}`

          pool.query(checkSongs, (error, result) => {
            if(error)
              res.send(error)

            var myTracks = []

            result.rows.filter(function(each) {
              myTracks.push(each.track_id)
            })

            current.myTracks = myTracks

            var checkArtists = `select artist_id from favouriteartists where user_id = ${req.session.loggedID}`

            pool.query(checkArtists, (error, result) => {
              if(error)
                res.send(error)

              var myArtists = []

              result.rows.filter(function(each) {
                myArtists.push(each.artist_id)
              })

              current.myArtists = myArtists


              if(loadedIDs.length != 0){

                var gatherRatings = `select rating_target, avg(rating) from ratings where rating_target in (${loadedIDs}) group by rating_target`

                pool.query(gatherRatings, (error, result) => {
                  if(error)
                    res.send(error)

                  var allRatings = result.rows.reduce(function(theDict, each) {
                    theDict[each.rating_target] = Math.round(each.avg * 1e2)/ 1e2
                    return theDict
                  }, {})

                  current.allRatings = allRatings

                  res.render('pages/resultsPage', current)
                })

              } else {
                current.allRatings = []

                res.render('pages/resultsPage', current)
              }


          })


        })

      })
    })
  }

  })

  app.get('/userSelect/:id', checkLogin, (req, res) => {

    var checkFollowingStatus = `select * from followers where the_user = ${req.session.loggedID} and is_following = ${req.params.id} `

    pool.query(checkFollowingStatus, (error, result) => {
      if(error)
        res.send(error)

      var gatherUser = `select * from users where id = ${req.params.id};`
          + `SELECT * FROM profile_history where id = ${req.params.id} order by stamp;`;


      var following

      if(result.rows.length == 0){
        following = false
      }
      else {
        following = true
      }

      pool.query(gatherUser, (error, result) => {

        if(error)
          res.send(error)

        current = {'username' : req.session.username, 'results' : result[0].rows[0], 'history' : result[1].rows, 'following' : following}

        res.render('pages/requestedPage', current)
      })

    })

  })

  app.post('/songToFaves', checkLogin, (req, res) => {

    if(req.body.add){
      var addSong = `insert into favouritetracks values(DEFAULT, ${req.session.loggedID}, '${req.body.add}')`

      pool.query(addSong, (error, result) => {
        if(error)
          res.status(400).send(error)
        res.status(200).send({'add': `${req.body.add}` })
      })
    }
    else {
      var removeSong = `delete from favouritetracks where user_id = ${req.session.loggedID} and track_id = '${req.body.delete}'`

      pool.query(removeSong, (error, result) => {
        if(error)
          res.status(400).send(error)
        res.status(200).send({'delete': `${req.body.delete}`})
      })
    }

  })

  app.post('/artistToFaves', checkLogin, (req, res) => {

    if(req.body.add){
      var addArtist = `insert into favouriteartists values(DEFAULT, ${req.session.loggedID}, '${req.body.add}')`

      pool.query(addArtist, (error, result) => {
        if(error)
          res.status(400).send(error)
        res.status(200).send({'add': `${req.body.add}` })
      })
    }
    else {
      var removeArtist = `delete from favouriteartists where user_id = ${req.session.loggedID} and artist_id = '${req.body.delete}'`

      pool.query(removeArtist, (error, result) => {
        if(error)
          res.status(400).send(error)
        res.status(200).send({'delete': `${req.body.delete}` })
      })
    }

  })

  app.post('/albumExplore', checkLogin, async (req, res) => {

    var info = {'username' : req.session.username, 'album' : req.body.album, 'picture' : req.body.picture}

    var loadedSongsIDs = []

    await SpotifyAPI.getAlbumTracks(`${req.body.id}`).then(
      function(data) {
        info.songs = data.body.items
        data.body.items.forEach(function(x) {
        loadedSongsIDs.push(`'${x.id}'`)
        })
      },
      function(error) {
        res.send(error)
      });

    var checkSongs = `select track_id from favouritetracks where user_id = ${req.session.loggedID}`

    pool.query(checkSongs, (error, result) => {
      if(error)
        res.send(error)

      var myTracks = []

      result.rows.filter(function(each) {
        myTracks.push(each.track_id)
      })

      info.myTracks = myTracks

      var gatherRatings = `select rating_target, avg(rating) from ratings where rating_target in (${loadedSongsIDs}) group by rating_target`

      pool.query(gatherRatings, (error, result) => {
        if(error)
          res.send(error)

        var allRatings = result.rows.reduce(function(theDict, each) {
          theDict[each.rating_target] = Math.round(each.avg * 1e2)/ 1e2
          return theDict
        }, {})

        info.allRatings = allRatings

        res.render('pages/albumExplore', info)
      })
    })



  })

  app.get('/Rate/:type/:id', checkLogin, (req, res) => {

    var current = {'username' : req.session.username}
    current.info = []

    if(req.params.type == 'song'){
      current.type = 'Song'
      current.Genres = false
      SpotifyAPI.getTracks([`${req.params.id}`]).then(
        function(data) {
            var song = {}
            song.name = data.body.tracks[0].name
            song.id = data.body.tracks[0].id
            song.artists = data.body.tracks[0].artists.map(a => a.name)

            if(data.body.tracks[0].album.images.length != 0 ){
              song.picture = data.body.tracks[0].album.images[0].url
            } else {
              song.picture = false
            }

            song.popularity = data.body.tracks[0].popularity

            current.info = song

            var gatherRatings = `select rating_target, avg(rating) from ratings group by rating_target having rating_target = '${req.params.id}'`

            pool.query(gatherRatings, (error, result) => {
              if(error)
                res.send(error)

              var thisRating = result.rows.reduce(function(theDict, each) {
                theDict[each.rating_target] = Math.round(each.avg * 1e2)/ 1e2
                return theDict
              }, {})

              current.thisRating = thisRating

              var gatherMyRating = `select rating from ratings where user_id = ${req.session.loggedID} and rating_target = '${req.params.id}'`

              pool.query(gatherMyRating, (error, result) => {
                if(error)
                  res.send(error)
                if(result.rowCount == 0){
                  current.myRating = []
                  res.render('pages/ratingPage', current)

                } else {
                  current.myRating = result.rows[0].rating
                  res.render('pages/ratingPage', current)
                }

              })

            })

        },
        function(error) {
          res.send(error)
        });
    } else {
      current.type = 'Artist'
      current.Genres = true
      SpotifyAPI.getArtist(`${req.params.id}`).then(
        function(data) {
            var artist = {}
            artist.name = data.body.name
            artist.id = data.body.id

            if(data.body.images.length != 0 ){
              artist.picture = data.body.images[0].url
            } else {
              artist.picture = false
            }

            artist.genres = data.body.genres.map(x => x.replace(/(^\w|\s\w|\&\w)/g, (y) => { return y.toUpperCase()} ))

            artist.popularity = data.body.popularity

            current.info = artist

            var gatherRatings = `select rating_target, avg(rating) from ratings group by rating_target having rating_target = '${req.params.id}'`

            pool.query(gatherRatings, (error, result) => {
              if(error)
                res.send(error)

              var thisRating = result.rows.reduce(function(theDict, each) {
                theDict[each.rating_target] = Math.round(each.avg * 1e2)/ 1e2
                return theDict
              }, {})

              current.thisRating = thisRating

              var gatherMyRating = `select rating from ratings where user_id = ${req.session.loggedID} and rating_target = '${req.params.id}'`

              pool.query(gatherMyRating, (error, result) => {
                if(error)
                  res.send(error)
                if(result.rowCount == 0){
                  current.myRating = []
                  res.render('pages/ratingPage', current)

                } else {
                  current.myRating = result.rows[0].rating
                  res.render('pages/ratingPage', current)
                }

              })

            })

        },
        function(error) {
          res.send(error)
        });
    }


  })

  app.post('/updateRating', checkLogin, (req, res) => {

    var checkTable = `select * from ratings where user_id = ${req.session.loggedID} and rating_target = '${req.body.update}'`

    pool.query(checkTable, (error, result) => {
      if(error)
        res.send(error)

      var insertOrUpdate;

      if(result.rowCount == 0){
        insertOrUpdate = `insert into ratings (user_id, rating_target, rating) values(${req.session.loggedID}, '${req.body.update}', ${req.body.rating})`

        pool.query(insertOrUpdate, (error, result) => {

          if(error)
            res.send(error)
          res.redirect('/home')
        })
      } else {

        insertOrUpdate = `update ratings set rating = ${req.body.rating} where user_id = ${req.session.loggedID} and rating_target = '${req.body.update}'`

        pool.query(insertOrUpdate, (error, result) => {
          if(error)
            res.send(error)
          res.redirect('/home')
        })
      }



    })

  })

  app.post('/interact/:id', checkLogin, (req, res) => {
    if(req.body.follow){

      var addFollow = `insert into followers values(default, ${req.session.loggedID}, ${req.params.id})`

      pool.query(addFollow, (error, result) => {
        if(error)
          res.send(error)

        res.redirect('/userSelect/' + req.params.id)
      })


    } else if(req.body.unFollow){
      var unFollow = `delete from followers where the_user = ${req.session.loggedID} and is_following = ${req.params.id}`

      pool.query(unFollow, (error, result) => {
        if(error)
          res.send(error)

        res.redirect('/userSelect/' + req.params.id)
      })

    }

    else {
      var checkforchat = "SELECT chatid FROM chats WHERE participants = array['"
      + req.session.username
      + "',(SELECT username FROM users WHERE id = "
      + req.params.id
      + ")] OR participants = array[(SELECT username FROM users WHERE id = "
      + req.params.id
      + "),'"
      + req.session.username
      + "'] ORDER BY chatid DESC LIMIT 1";
      pool.query(checkforchat, (error, result) => {
        if(error){
          res.send(error);
        }
        else{
          if (result.rows.length > 0){
            res.redirect('/chat/' + result.rows[0].chatid)
          }
          else{
            var makeDMchat = "INSERT INTO chats VALUES (default, CONCAT('"
            + req.session.username
            + " and ',"
            + "(SELECT username FROM users WHERE id = "
            + req.params.id
            + ")), ARRAY ['" + req.session.username + "',(SELECT username FROM users WHERE id = "
            + req.params.id
            + ")]);SELECT chatid FROM chats WHERE participants = array['"
            + req.session.username
            + "',(SELECT username FROM users WHERE id = "
            + req.params.id
            + ")] OR participants = array[(SELECT username FROM users WHERE id = "
            + req.params.id
            + "),'"
            + req.session.username
            + "'] ORDER BY chatid DESC LIMIT 1";
            pool.query(makeDMchat, (error, result) => {
              if(error)
                res.send(error);
              res.redirect('/chat/' + result[1].rows[0].chatid)
            });
          }
        }
      })
    }

  })

  // Each users personal profile which can be accessed by clicking the users name in the top right corner of the navigaiton bar.
  app.get('/profile', checkLogin, async (req, res) => {

    if (req.query.valid == 'false'){
      if (req.query.field == 'pic'){
        var alert = 'pic'
      }
      else{
        var alert = 'uname'
      }
    }
    else {
      var alert = false
    }

    var mesData;
    var combined;
    var tracks = [];
    var artists = [];

    function allCheck(mesData){
      return new Promise(resolve => {

        var allQuery = `select * from users where id = ${req.session.loggedID};`
        + `SELECT * FROM profile_history where id = ${req.session.loggedID} order by stamp;`
        + `SELECT * FROM users where id = ${req.session.loggedID} AND usertype='A';` + `select track_id from favouritetracks where user_id = ${req.session.loggedID} limit 3;` + `select artist_id from favouriteartists where user_id = ${req.session.loggedID} limit 3;`;

        pool.query(allQuery, (error, result) => {
          if(error)
            res.send(error)

          if(result[2].rows.length!=0) {
            mesData= {'user_info':result[0].rows,'user_history':result[1].rows, 'username':req.session.username, 'admin':true}
          } else {
            mesData= {'user_info':result[0].rows,'user_history':result[1].rows, 'username':req.session.username, 'admin':false}
          }

          mesData.alert = alert
          mesData.spotify = req.session.Spotify

          if(result[3].rows.length == 0){
            mesData.myTracks = []
          } else {
            tracks = result[3].rows.map(a => a.track_id)
            mesData.myTracks = tracks
          }

          if(result[4].rows.length == 0){
            mesData.myArtists = []
          } else {
            artists = result[4].rows.map(a => a.artist_id)
            mesData.myArtists = artists
          }


          combined = tracks.concat(artists)

          resolve(mesData);


      })

    })

  }

  function theTracksGrab(mesData){
    return new Promise(resolve => {

      SpotifyAPI.getTracks(tracks).then(
        function(data) {
          data.body.tracks.forEach((item) => {

            var song = {}
            song.name = item.name
            song.id = item.id
            song.artists = item.artists.map(a => a.name)

            if(item.album.images.length != 0 ){
              song.picture = item.album.images[0].url
            } else {
              song.picture = false
            }

            song.popularity = item.popularity

            mesData.songsInfo.push(song)

          });

        resolve(mesData);

      },
      function(error) {
        res.send(error)
      });

    })

  }

  function theArtistsGrab(mesData){
    return new Promise(resolve => {

      SpotifyAPI.getArtists(artists).then(
        function(data) {
          data.body.artists.forEach((item) => {

            var artist = {}
            artist.name = item.name
            artist.id = item.id

            if(item.images.length != 0 ){
              artist.picture = item.images[0].url
            } else {
              artist.picture = false
            }

            artist.genres = item.genres.map(x => x.replace(/(^\w|\s\w|\&\w)/g, (y) => { return y.toUpperCase()} ))

            artist.popularity = item.popularity

            mesData.artistsInfo.push(artist)

          });

          resolve(mesData);

        },
        function(error) {
          res.send(error)
        });

    })

  }

  var check1 = await allCheck(mesData)

  check1.songsInfo = []
  check1.artistsInfo = []
  check1.allRatings = []

  if(tracks.length == 0){
    check2 = check1
  } else {
    check2 = await theTracksGrab(check1)
  }

  if(artists.length == 0){
    check3 = check2
  } else {
    check3 = await theArtistsGrab(check2)
  }

  if(combined.length == 0){
    res.render('pages/profile', check3)
  } else {

    combined = combined.map(item => "'" + item + "'")

    var gatherRatings = `select rating_target, avg(rating) from ratings where rating_target in (${combined}) group by rating_target`

    pool.query(gatherRatings, (error, result) => {
      if(error)
        res.send(error)

      var allRatings = result.rows.reduce(function(theDict, each) {
        theDict[each.rating_target] = Math.round(each.avg * 1e2)/ 1e2
        return theDict
      }, {})

      check3.allRatings = allRatings

      res.render('pages/profile', check3 )

    })


  }

  })

  app.post('/contentView',checkLogin, (req, res) => {

    var current = {'username' : req.session.username, 'type' : req.body.type}
    current.content = []

    if(req.body.type == 'songs'){
      var getSongs = `select track_id from favouritetracks where user_id = ${req.session.loggedID};`

      pool.query(getSongs, (error, result) => {
        if(error)
          res.send(error)

        if(result.rows.length == 0){
          res.render('/home')
        } else {

        tracks = result.rows.map(a => a.track_id)

        SpotifyAPI.getTracks(tracks).then(
          function(data) {
            data.body.tracks.forEach((item) => {

              var song = {}
              song.name = item.name
              song.id = item.id

              song.artists = item.artists.map(a => a.name)

              if(item.album.images.length != 0 ){
                song.picture = item.album.images[0].url
              } else {
                song.picture = false
              }

              song.popularity = item.popularity

              current.content.push(song)

            });

          tracks = tracks.map(item => "'" + item + "'")

          var getRatings = `select rating_target, avg(rating) from ratings where rating_target in (${tracks}) group by rating_target`

          pool.query(getRatings, (error, result) => {
            if(error)
              res.send(error)

            var allRatings = result.rows.reduce(function(theDict, each) {
              theDict[each.rating_target] = Math.round(each.avg * 1e2)/ 1e2
              return theDict
            }, {})

            current.allRatings = allRatings

            res.render('pages/yourContent', current)

          })

        },
        function(error) {
          res.send(error)
        });

      }

      })

    } else {
      var getArtists = `select artist_id from favouriteartists where user_id = ${req.session.loggedID}`

      pool.query(getArtists, (error, result) => {
        if(error)
          res.send(error)

        artists = result.rows.map(a => a.artist_id)

        SpotifyAPI.getArtists(artists).then(
          function(data) {
            data.body.artists.forEach((item) => {

              var artist = {}
              artist.name = item.name
              artist.id = item.id

              if(item.images.length != 0 ){
                artist.picture = item.images[0].url
              } else {
                artist.picture = false
              }

              artist.genres = item.genres.map(x => x.replace(/(^\w|\s\w|\&\w)/g, (y) => { return y.toUpperCase()} ))

              artist.popularity = item.popularity

              current.content.push(artist)

            });

            artists = artists.map(item => "'" + item + "'")

            var getRatings = `select rating_target, avg(rating) from ratings where rating_target in (${artists}) group by rating_target`

            pool.query(getRatings, (error, result) => {
              if(error)
                res.send(error)

              var allRatings = result.rows.reduce(function(theDict, each) {
                theDict[each.rating_target] = Math.round(each.avg * 1e2)/ 1e2
                return theDict
              }, {})

              current.allRatings = allRatings

              res.render('pages/yourContent', current)

            })

          },
          function(error) {
            res.send(error)
          });

      })

    }

  })

  app.get('/logout', (req, res) => {
    req.session.destroy()
    res.redirect('/')
  })

  // The registration page that users will be directed to when they click the link on the login page to make an account.
  app.post('/registration', async (req,res)=> {
    var uname=req.body.my_username;
    var email=req.body.my_email.toLowerCase();
    var password1=req.body.my_password1;
    var password2=req.body.my_password2;
    var keep = false;

    if(password1!=password2){
      return res.redirect("/register" + '?error=password')
    }
    else {
    var check = `SELECT username, email from users where username = '${uname}' or email = '${email}';`

    await pool.query(check, (error, result) => {
      if(error)
          res.send(error)

      if(result.rows.length != 0){
        result.rows.forEach(function(x){
          if(x.username == uname){
            return res.redirect("/register" + '?error=username')
          }
          else if(x.email == email){
            return res.redirect("/register" + '?error=email')
          }
        })
      }

      else{

        var insertQuery=`INSERT INTO users(username,email,password) VALUES('${uname}','${email}','${password2}')`;
        pool.query(insertQuery, (error, result) => {
          if(error)
            res.send(error)
        });
          return res.redirect("/" + '?valid=registered')

    }
  })
}

    });

  // This function accepts the login details from the user, and checks if they are in the database. If they are, it brings them to their homepage, if not, it sends an error message.
  app.post('/authentification', (req,res)=> {
    var username=req.body.username;
    var upassword=req.body.mypassword;

    var username = username.replace(/'/g, "''")

    var selectQuery= `SELECT id, username, password FROM users WHERE username='${username}'`;
         pool.query(selectQuery,(error,result) =>{
           if(error){res.send(error)}


           var results = {'rows': result.rows}
           if(Object.keys(results.rows).length===0 ){
             res.redirect('/' + '?valid=username');
           }
           else{
           if(results.rows[0].username==username && results.rows[0].password==upassword){
             req.session.loggedin = true;
             req.session.loggedID = results.rows[0].id
             req.session.username = results.rows[0].username


             // Regular Client credentials for users without spotify.
             SpotifyAPI.clientCredentialsGrant().then(
               function(data){
                 SpotifyAPI.setAccessToken(data.body['access_token']);
                 res.redirect('/home');
               },
               function(error){
                 res.send(error);
               }
             )


           }
           else{
             res.redirect('/' + '?valid=password');  // After user enters wrong password they will get rendered to this page
           }
         }
         })
      });

    app.get('/passwordReset', (req, res) => {
      res.render('pages/passwordReset', {'alert' : req.query.valid})
    })

    app.post('/ForgotPassword', async(req,res)=>{
        var email=req.body.myemail.toLowerCase();
        var password1=req.body.mypassword1;
        var password2=req.body.mypassword2;

        if(password1!=password2){
          res.redirect('/passwordReset' + "?valid=match" );
        }
        else{
          const client=await pool.connect();
            var updateQuery=`UPDATE users SET password='${password2}' WHERE email='${email}'`;
            const result = await client.query(updateQuery);
            client.release();
            if (result.rowCount == 0){
              res.redirect('/passwordReset' + "?valid=unknown" );
            }
            else{
               res.redirect('/' + "?valid=changed");
            }

          }
        });
  // This function updates the users profile picture. If the picture is valid it will change, if not, and error will be sent.
  app.post('/pictureChoose', checkLogin, pictures.single('profilePicture'), (req, res) => {

    if (!req.file){
      res.redirect('/profile' + '?valid=false' + '&field=pic')
    }
    else {
      var pictureUpdate = `update users set picture = '/${req.file.path}' where id = ${req.session.loggedID}`

      var picturedelete =  `select picture from users where id = ${req.session.loggedID}`

      pool.query(picturedelete, (error, result) => {
        if(error)
          res.send(error)

        if(result.rows[0].picture != '/pictures/lang-logo.png'){
          fs.unlink(result.rows[0].picture, (err) => {
            if(error)
              res.send(error)
            })
          }

          pool.query(pictureUpdate, (error, resut) => {
            if(error)
              res.send(error)
            res.redirect('/profile' + '?valid=true' + '&field=pic')
          })

        })

    }

  })

  // Similar to the /pictureChoose function, this allows the user to change their username if they wish.
  app.post('/usernameChange', checkLogin, async (req, res) => {

    var input = `${req.body.uname}`
    var cleaned = input.replace(/'/g, "''")

    var checkDatabase = `select * from users where username = '${cleaned}'`

    await pool.query(checkDatabase, (error, result) => {
      if(error)
        res.send(error)

      if((result.rows).length){
        res.redirect('/profile' + '?valid=' + false + '&field=uname')
      }
      else {
        var usernameChange = `update users set username = '${cleaned}' where id = ${req.session.loggedID}`

        pool.query(usernameChange, (error, result) => {
          if(error)
            res.send(error)

          res.redirect('/profile' + '?valid=' + true)
        })

      }

    })


  })

  //identifies current chat
  var chatID;
  //link to chat page
  app.get('/chat/:chatID', checkLogin, (req,res)=>{
    var uname =req.session.username;
    chatID = req.params.chatID;
    var getmessagesQuery = "SELECT * FROM messages where chatID = " + chatID + "ORDER BY time ASC;"
    + "SELECT * FROM chats WHERE '" + uname +  "'= any(participants);"
    + "SELECT * FROM chats WHERE chatID = " + chatID;

    pool.query(getmessagesQuery, (error,result) => {
      if (error)
        res.end(error);
      var mesData= {'mesInfo':result[0].rows,'chatInfo':result[1].rows, 'username':uname, 'currentchat':result[2].rows[0]}
      res.render('pages/chat',mesData);
    })
  })

  app.post('/chat/create', checkLogin, (req,res)=>{
    var uname = req.session.username;
    let quotemoddedchatname = req.body.chatnameinput.replace(/'/g,"''");
    var makechatQuery = "INSERT INTO chats VALUES (default, '" + quotemoddedchatname + "', ARRAY ['" + uname + "'])";
    var getinfoQuery = " SELECT * FROM chats WHERE name = '" + quotemoddedchatname  + "' ORDER BY chatid DESC";

    pool.query(makechatQuery, (error,unused) => {
      if (error)
        res.end(error);
      pool.query(getinfoQuery, (error,result) => {
        if (error)
          res.end(error);
        let data = {'newchatinfo':result.rows[0] }
        res.render('pages/creategroup', data);
      })
    })
  })

  app.post('/chat/:chatID/leave', checkLogin, (req,res)=>{
    var uname = req.session.username;
    chatID = req.params.chatID;
    var leavechatQuery = "UPDATE chats SET participants = array_remove(participants, '" + uname + "') WHERE chatid = " + chatID;

    pool.query(leavechatQuery, (error,unused) => {
      if (error)
        res.end(error);
      res.render('pages/leavegroup');
    })
  })

  //Socket.IO Messages Setup
  io.on('connection', (socket) => {
    console.log('user connected');
    if (chatID >= 0){
      socket.join(chatID);
      console.log("in chat: " + chatID);
    }

     //temporary ask for username
    socket.on('username', (username)=> {
      socket.username = username;
      socket.join(socket.username);
      console.log("joined room: " + socket.username);
      var getNotificationsQuery = "SELECT * FROM notifications WHERE recipient = '" + socket.username + "' ORDER BY time ASC";
      pool.query(getNotificationsQuery, (error,result)=> {
        io.in(socket.username).emit('oldnotifications', result.rows);
        console.log("emit oldNotification")
      })
    });

    socket.on('disconnect', () => {
      console.log('user disconnected');
    });

    socket.on("chat_message", (info)=> {
      //broadcast message to everyone in port:5000 except yourself.
      socket.to(info.chatID).emit("received", {name: socket.username , message: info.msg });
      let quotemoddedmessage = info.msg.replace(/'/g,"''");
      var storemessageQuery = "INSERT INTO messages VALUES (" + info.chatID + ", default, '" + socket.username + "', " + "'" + quotemoddedmessage + "')";
      pool.query(storemessageQuery, (error,result)=> {
      })
      socket.emit("chat_message", {name: socket.username , message: info.msg });
      var getmembersQuery = "SELECT * FROM chats WHERE chatid = " + info.chatID;
      pool.query(getmembersQuery, (error, result)=> {
        result.rows[0].participants.forEach((member)=>{
          var alertmessage = socket.username + ' sent a message in the chat: ' + result.rows[0].name;
          if (member != socket.username){
            var removeOldAlertQuery = "DELETE FROM notifications WHERE recipient = '" + member + "' AND message = '" + alertmessage + "'";
            var storeAlertQuery = "INSERT INTO notifications VALUES (default, '" + member + "', '" + alertmessage + "')";
            pool.query(removeOldAlertQuery, (error, result)=> {
              pool.query(storeAlertQuery, (error, result)=> {})
              })

            socket.to(member).emit('notification', {link: '/chat/' + info.chatID, message: alertmessage });
          }
        })
      })
    });

    socket.on("add_participant", (info)=> {
      var addparticipantQuery =  "UPDATE chats SET participants = array_append(participants, '" + info.msg + "') WHERE chatid = " + info.chatID
      pool.query(addparticipantQuery, (error,result)=> {
      })

      var userAddedMessage = socket.username + " added " + info.msg + " to the chat."
      socket.to(info.chatID).emit("received", {name: socket.username , message: userAddedMessage });
      socket.emit("chat_message", {name: socket.username , message: userAddedMessage });

      var storemessageQuery = "INSERT INTO messages VALUES (" + info.chatID + ", default, '" + socket.username + "', " + "'" + userAddedMessage + "')";
      pool.query(storemessageQuery, (error,result)=> {
      })
    })

    socket.on("user_left", (info)=> {
      var userleftMessage = socket.username + " " + info.msg
      socket.to(info.chatID).emit("received", {name: socket.username , message: userleftMessage });
      socket.emit("chat_message", {name: socket.username , message: userleftMessage });

      var storemessageQuery = "INSERT INTO messages VALUES (" + info.chatID + ", default, '" + socket.username + "', " + "'" + userleftMessage + "')";
      pool.query(storemessageQuery, (error,result)=> {
      })
    })

    socket.on("dismissAlert", (info) =>{
      var removeAlertQuery = "DELETE FROM notifications WHERE recipient = '" + info.recipient + "' AND message = '" + info.message + "'";
      pool.query(removeAlertQuery, (error,result)=> {})
      console.log('dismissing message: ' + info.message + "; to: " + info.recipient)
    })

  });

  app.post('/spotifyTry', checkLogin, (req, res) => {

    res.redirect(authorizeURL)

  })

  app.get('/spotifyAuth', (req, res) => {

    SpotifyAPI.authorizationCodeGrant(req.query.code).then(
      function(data) {
        SpotifyAPI.setAccessToken(data.body['access_token']);
        SpotifyAPI.setRefreshToken(data.body['refresh_token']);
        req.session.Spotify = true;
        res.redirect('/profile')
      },
      function(err) {
        res.send(err);
      }
    )

  })


// Google OAuth 2.0 Setup //

app.get('/google_login', (req,res)=> {
  // Create an OAuth2 client object from the credentials in our config file
  const oauth2Client = new OAuth2(CONFIG.oauth2Credentials.client_id, CONFIG.oauth2Credentials.client_secret, CONFIG.oauth2Credentials.redirect_uris[0]);
  // Obtain the google login link to which we'll send our users to give us access
  const loginLink = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Indicates that we need to be able to access data continously without the user constantly giving us consent
    scope: CONFIG.oauth2Credentials.scopes // Using the access scopes from our config file
  });
  return res.render("pages/google_login", { loginLink: loginLink });
});

app.get('/auth_callback', function (req, res) {
  // Create an OAuth2 client object from the credentials in our config file
  const oauth2Client = new OAuth2(CONFIG.oauth2Credentials.client_id, CONFIG.oauth2Credentials.client_secret, CONFIG.oauth2Credentials.redirect_uris[0]);
  if (req.query.error) {
    // The user did not give us permission.
    return res.redirect('/home');
  } else {
    oauth2Client.getToken(req.query.code, function(err, token) {
      if (err)
        return res.redirect('/home');

      // Store the credentials given by google into a jsonwebtoken in a cookie called 'jwt'
      res.cookie('jwt', jwt.sign(token, CONFIG.JWTsecret));
      return res.redirect('/mymusic');
    });
  }
});

module.exports = app;

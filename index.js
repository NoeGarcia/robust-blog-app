import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { __dirname } from './utils.js'; // Import the utility

const app = express();
const PORT = process.env.PORT || 3000;

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        // Set the filename to be original name or generate a unique name
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Load users and posts from JSON files
const usersFile = path.join(__dirname, '/data/users.json');
let users = [];
if (fs.existsSync(usersFile)) {
    users = JSON.parse(fs.readFileSync(usersFile));
}

const postsFile = path.join(__dirname, '/data/posts.json');
let posts = [];
if (fs.existsSync(postsFile)) {
    posts = JSON.parse(fs.readFileSync(postsFile));
}

// Serve static files and views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const postsPerPage = 6;
    const startIndex = (page - 1) * postsPerPage;
    const endIndex = page * postsPerPage;
    const searchQuery = req.query.search || '';

    // Filter posts based on search query
    const filteredPosts = posts.filter(post => 
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Pagination
    const paginatedPosts = filteredPosts.slice(startIndex, endIndex);
    
    res.render('index', {
        posts: paginatedPosts,
        currentPage: page,
        totalPages: Math.ceil(posts.length / postsPerPage),
        searchQuery: searchQuery,
        session: req.session    // Pass session to the template
    });
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (users.find(user => user.username === username)) {
        return res.status(400).send('User already exists');
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword });
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users.find(user => user.username === username);
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).send('Invalid credentials');
    }
    req.session.user = username;
    res.redirect('/');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Display the form for creating a new post
app.get('/new', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('new', { session: req.session });
});

// Handle the form submission for creating a new post
app.post('/add', upload.single('image'), (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    const { title, content } = req.body;
    const image = req.file ? `/images/${req.file.filename}` : null; // Use the path to the image file
    const newPost = {
        id: posts.length ? posts[posts.length - 1].id + 1 : 1,
        title,
        content,
        image,
        date: new Date(),
        author: req.session.user
    };
    posts.push(newPost);
    fs.writeFileSync(postsFile, JSON.stringify(posts, null, 2));
    res.redirect('/');
});

// View a single post
app.get('/post/:id', (req, res) => {
    const post = posts.find(p => p.id == req.params.id);
    if (post) {
        res.render('post', { post, session: req.session });
    } else {
        res.redirect('/');
    }
});

app.get('/edit/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }    
    const post = posts.find(p => p.id == req.params.id);
    if (post && post.author === req.session.user) {
        res.render('edit', { post, session: req.session });
    } else {
        res.redirect('/');
    }
});

app.post('/edit/:id', upload.single('newImage'), (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }    
    const { title, content, currentImage} = req.body;
    //const image = req.body.image ? `/images/${req.body.image}` : null; // Use the path to the image file
    const postId = parseInt(req.params.id, 10);
    const post = posts.find(p => p.id == postId);
    let newImage;
    if (post && post.author === req.session.user) {
        if(req.body.newImage) {
            newImage = '/images/' + req.body.newImage;
        } else {
            newImage = currentImage;
        }
        post.title = title;
        post.content = content;
        post.image = newImage;
        fs.writeFileSync(postsFile, JSON.stringify(posts, null, 2));
    }
    res.redirect('/');
});

app.get('/delete/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    const postId = parseInt(req.params.id, 10);
    const postIndex = posts.findIndex(p => p.id == postId);
    if (postIndex !== -1 && posts[postIndex].author === req.session.user) {
        posts.splice(postIndex, 1);
        fs.writeFileSync(postsFile, JSON.stringify(posts, null, 2));
    }
    res.redirect('/');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
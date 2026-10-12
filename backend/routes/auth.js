const router=require('express').Router();
const bcrypt=require('bcrypt');
const jwt=require('jsonwebtoken');
const pool=require('../config/database');
const {auth}=require('../middleware/auth');
function token(user){return jwt.sign({id:user.id,role:user.role},process.env.JWT_SECRET,{expiresIn:'7d'})}
router.post('/register',async(req,res,next)=>{try{
  const {name,email,password,phone,address}=req.body;
  if(!name||!email||!password||!phone)return res.status(400).json({message:'Name, email, password and phone are required.'});
  if(password.length<8)return res.status(400).json({message:'Password must be at least 8 characters.'});
  const [exists]=await pool.query('SELECT id FROM users WHERE email=?',[email.trim().toLowerCase()]);
  if(exists.length)return res.status(409).json({message:'Email already registered.'});
  const hash=await bcrypt.hash(password,12);const conn=await pool.getConnection();
  try{await conn.beginTransaction();const [u]=await conn.query('INSERT INTO users(name,email,password,role) VALUES(?,?,?,"customer")',[name,email.trim().toLowerCase(),hash]);await conn.query('INSERT INTO customers(user_id,phone,address) VALUES(?,?,?)',[u.insertId,phone,address||null]);await conn.commit();
    const user={id:u.insertId,name,email:email.trim().toLowerCase(),role:'customer'};res.status(201).json({user,token:token(user)});
  }catch(e){await conn.rollback();throw e}finally{conn.release()}
}catch(e){next(e)}});

router.post('/login',async(req,res,next)=>{try{const {email,password}=req.body;const [rows]=await pool.query('SELECT id,name,email,password,role FROM users WHERE email=?',[String(email||'').trim().toLowerCase()]);if(!rows.length||!(await bcrypt.compare(password||'',rows[0].password)))return res.status(401).json({message:'Email or password is incorrect.'});const user={id:rows[0].id,name:rows[0].name,email:rows[0].email,role:rows[0].role};res.json({user,token:token(user)})}catch(e){next(e)}});
router.post('/logout',auth,(req,res)=>res.json({message:'Logged out.'}));
router.get('/me',auth,(req,res)=>res.json({user:req.user}));
module.exports=router;
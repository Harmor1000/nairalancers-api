import User from "../models/user.model.js"
import jwt from "jsonwebtoken";
import createError from "../utils/createError.js";

export const deleteUser = async (req, res, next)=>{

    const user = await User.findById(req.params.id);
    
        if(req.userId !== user._id.toString()){
            return next(createError(403, "You can only delete your account!"));
        }

    await User.findByIdAndDelete(req.params.id);
    res.status(200).send("deleted.");
};

export const getUser = async (req, res, next)=>{
    const user = await User.findById(req.params.id);

    res.status(200).send(user);
};


// 🆕 New function for multiple IDs
// 🆕 Get multiple users by IDs (for batched requests) from chatgpt
export const getUsersByIds = async (req, res, next) => {
  try {
    const ids = req.query.ids?.split(",");
    if (!ids || ids.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }

    const users = await User.find({ _id: { $in: ids } }).select("username name _id img");

    res.status(200).json(
      users.map((u) => ({
        id: u._id.toString(),
        username: u.username || u.firstName || "Unknown",
        img: u.img || null,
      }))
    );
  } catch (err) {
    next(err);
  }
};
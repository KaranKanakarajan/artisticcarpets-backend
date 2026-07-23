import Complaint from "../models/complaint.model.js";
import User from "../models/user.model.js";
import asyncHandler from "../utils/asyncHandler.js";
import { successResponse, errorResponse } from "../utils/apiResponse.js";

// @desc    Create a new complaint
// @route   POST /api/complaints
// @access  Private
export const createComplaint = asyncHandler(async (req, res) => {
  const { orderId, issueType, description } = req.body;

  if (!orderId || !issueType || !description) {
    return errorResponse(res, "Please provide all required fields", 400);
  }

  const ticketId = `TKT-${Math.floor(1000 + Math.random() * 9000)}`;

  let userId = req.user?._id;
  if (!userId) {
    // Fallback for demo frontend without real auth
    const fallbackUser = await User.findOne({});
    userId = fallbackUser?._id;
  }

  if (!userId) {
    return errorResponse(res, "No user available to associate the complaint with.", 400);
  }

  const complaint = await Complaint.create({
    ticketId,
    user: userId,
    orderId,
    issueType,
    description,
  });

  return successResponse(res, { data: complaint }, "Complaint submitted successfully", 201);
});

// @desc    Get user's complaints
// @route   GET /api/complaints/my-complaints
// @access  Private (or Demo)
export const getUserComplaints = asyncHandler(async (req, res) => {
  let userId = req.user?._id;
  if (!userId) {
    const fallbackUser = await User.findOne({});
    userId = fallbackUser?._id;
  }

  const complaints = userId ? await Complaint.find({ user: userId }).sort({ createdAt: -1 }) : [];
  return successResponse(res, { data: complaints }, "Complaints retrieved successfully");
});

// @desc    Get all complaints
// @route   GET /api/complaints
// @access  Private/Admin
export const getAllComplaints = asyncHandler(async (req, res) => {
  const complaints = await Complaint.find({})
    .populate("user", "name email")
    .sort({ createdAt: -1 });
  return successResponse(res, { data: complaints }, "All complaints retrieved successfully");
});

// @desc    Update complaint status
// @route   PUT /api/complaints/:id
// @access  Private/Admin
export const updateComplaintStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  
  if (!["Open", "In Progress", "Resolved"].includes(status)) {
    return errorResponse(res, "Invalid status", 400);
  }

  const complaint = await Complaint.findById(req.params.id);

  if (!complaint) {
    return errorResponse(res, "Complaint not found", 404);
  }

  complaint.status = status;
  await complaint.save();

  return successResponse(res, { data: complaint }, "Complaint status updated successfully");
});

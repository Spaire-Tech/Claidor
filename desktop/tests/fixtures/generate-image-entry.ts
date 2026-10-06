// One bundle for the GenerateImage test: the tool and the proto result it
// renders, from one copy of every module.
export { createGenerateImageTool } from "../../source/packages/agent/tools/core/generate-image.js";
export { GenerateImageResult, GenerateImageSuccess } from "../../source/packages/proto/generated/agent/v1/generate_image_tool_pb.js";

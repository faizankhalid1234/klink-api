import { createPageRouterHandler } from '@fal-ai/server-proxy/nextjs';

if (process.env.FAL_API_KEY && !process.env.FAL_KEY) {
  process.env.FAL_KEY = process.env.FAL_API_KEY;
}

export default createPageRouterHandler();
export const config = {
  api: {
    bodyParser: false,
  },
};

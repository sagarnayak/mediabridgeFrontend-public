# MediaBridge Frontend

React + Vite frontend for the MediaBridge self-hosted S3 file management platform.

**Backend repo:** [github.com/sagarnayak/mediabridgeBackend-public](https://github.com/sagarnayak/mediabridgeBackend-public)

**Blog series:** [How MediaBridge was built](https://blog.hardcodeconsulting.tech/post/mediabridge-intro/) - 10 posts covering presigned uploads, search, caching, archive restore, thumbnails, and deployment.

---

## Stack

- React + TypeScript + Vite
- Axios (API client with JWT refresh interceptor)
- GitHub Actions for deployment to S3 + CloudFront (manual trigger)

---

## Setup

```bash
git clone https://github.com/sagarnayak/mediabridgeFrontend-public.git
cd mediabridgeFrontend-public
npm install
```

Copy the example env file:

```bash
cp .env.example .env
```

Set `VITE_API_URL` to your backend URL, then start the dev server:

```bash
npm run dev
```

---

## Deployment

The included GitHub Actions workflow (`deploy.yml`) deploys to S3 and invalidates CloudFront. It is set to manual trigger (`workflow_dispatch`). To use it, add the following secrets to your repository:

| Secret | Description |
|---|---|
| `VITE_API_URL` | Your backend API URL |
| `S3_BUCKET` | S3 bucket name for the frontend |
| `AWS_ACCESS_KEY_ID` | AWS access key with S3 and CloudFront permissions |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID |

Set the CloudFront default root object to `index.html` and configure a custom error response: 404 -> `/index.html` with status 200. This is required for React Router to work on direct URL loads.

---

## License

MIT

const isMobile = process.env.BUILD_TARGET === 'mobile'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isMobile ? 'export' : undefined,
  trailingSlash: isMobile,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig

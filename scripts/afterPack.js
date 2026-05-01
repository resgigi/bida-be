const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  const { appOutDir, packager } = context;
  const platform = packager.platform.name;

  console.log(`AfterPack: ${platform} - ${appOutDir}`);

  if (platform === 'windows') {
    const appName = packager.appInfo.productFilename;
    const resourcesDir = path.join(appOutDir, 'resources');

    // Ensure prisma folder exists in resources
    const prismaDestDir = path.join(resourcesDir, 'prisma');
    if (!fs.existsSync(prismaDestDir)) {
      fs.mkdirSync(prismaDestDir, { recursive: true });
    }

    // Copy prisma schema
    const prismaSrcSchema = path.join(context.appDir, 'prisma', 'schema.prisma');
    const prismaDestSchema = path.join(prismaDestDir, 'schema.prisma');
    if (fs.existsSync(prismaSrcSchema)) {
      fs.copyFileSync(prismaSrcSchema, prismaDestSchema);
      console.log('Copied schema.prisma to resources');
    }

    // Generate Prisma client in the packaged app
    try {
      const appDir = path.join(resourcesDir, 'app');
      const prismaDir = path.join(appDir, 'node_modules', '.prisma', 'client');
      if (!fs.existsSync(prismaDir)) {
        fs.mkdirSync(prismaDir, { recursive: true });
      }

      // Copy the generated prisma client
      const srcPrismaClient = path.join(context.appDir, 'node_modules', '.prisma', 'client');
      if (fs.existsSync(srcPrismaClient)) {
        const destPrismaClient = path.join(appDir, 'node_modules', '.prisma', 'client');
        fs.mkdirSync(path.dirname(destPrismaClient), { recursive: true });
        copyDirRecursive(srcPrismaClient, destPrismaClient);
        console.log('Copied Prisma client to packaged app');
      }
    } catch (err) {
      console.log('Prisma client copy warning (non-fatal):', err.message);
    }
  }
};

function copyDirRecursive(src, dest) {
  const fs = require('fs');
  const path = require('path');

  if (!fs.existsSync(src)) return;

  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((child) => {
      copyDirRecursive(path.join(src, child), path.join(dest, child));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

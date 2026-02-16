#!/usr/bin/env ts-node
/**
 * Route Audit Script
 * 
 * Scans all app/**/page.tsx files and updates ROUTES.md
 * Run: npx ts-node scripts/route-audit.ts
 */

import * as fs from 'fs'
import * as path from 'path'

interface RouteInfo {
  path: string
  filePath: string
  status: 'Used' | 'Ghost' | 'WIP' | 'Planned'
  description: string
}

// Ghost routes configuration
const GHOST_ROUTES = [
  '/exchange-deals',
  '/exchange-deals/[id]',
  '/exchange-deals/new'
]

// Route descriptions
const ROUTE_DESCRIPTIONS: Record<string, string> = {
  '/': 'Main dashboard',
  '/analytics': 'Analytics dashboard',
  '/assets': 'Assets list',
  '/assets/[id]': 'Asset detail page',
  '/cars': 'Cars inventory',
  '/cars/[id]': 'Car detail page',
  '/cars/clients/[id]': 'Auto client detail',
  '/cars/deals/[id]': 'Auto deal detail',
  '/cars/stock': 'Cars stock management',
  '/contacts': 'Contacts list',
  '/contacts/[id]': 'Contact detail page',
  '/deals': 'Deals list (legacy module)',
  '/deals/[id]': 'Deal detail (legacy)',
  '/finance-deals': 'Finance deals list',
  '/finance-deals/[id]': 'Finance deal detail',
  '/finance': 'Finance dashboard & internal exchange',
  '/finance/[id]': 'Cashbox detail',
  '/exchange': 'Client exchange interface',
  '/exchange-deals': 'Redirects to /exchange',
  '/exchange-deals/[id]': 'Redirects to /exchange',
  '/exchange-deals/new': 'Redirects to /exchange',
  '/hr': 'HR dashboard',
  '/hr/[id]': 'Employee detail',
  '/settings': 'Application settings',
  '/stock': 'Stock inventory',
  '/stock/[id]': 'Stock item detail',
}

function findPageFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir)

  files.forEach(file => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)

    if (stat.isDirectory()) {
      findPageFiles(filePath, fileList)
    } else if (file === 'page.tsx') {
      fileList.push(filePath)
    }
  })

  return fileList
}

function filePathToRoute(filePath: string): string {
  // Remove 'app/' prefix and '/page.tsx' suffix
  let route = filePath
    .replace(/^app\//, '')
    .replace(/\/page\.tsx$/, '')

  // Convert to route format
  if (route === '') return '/'
  return '/' + route
}

function groupRoutes(routes: RouteInfo[]): Record<string, RouteInfo[]> {
  const groups: Record<string, RouteInfo[]> = {
    'Dashboard': [],
    'Analytics': [],
    'Assets Management': [],
    'Auto Platform (Cars)': [],
    'Contacts (CRM)': [],
    'Deals (Legacy)': [],
    'Finance Deals': [],
    'Finance (Cashboxes)': [],
    'Exchange (Client Exchange)': [],
    'Exchange Deals (Ghost - Deprecated)': [],
    'HR': [],
    'Settings': [],
    'Stock Management': [],
  }

  routes.forEach(route => {
    if (route.path === '/') {
      groups['Dashboard'].push(route)
    } else if (route.path.startsWith('/analytics')) {
      groups['Analytics'].push(route)
    } else if (route.path.startsWith('/assets')) {
      groups['Assets Management'].push(route)
    } else if (route.path.startsWith('/cars')) {
      groups['Auto Platform (Cars)'].push(route)
    } else if (route.path.startsWith('/contacts')) {
      groups['Contacts (CRM)'].push(route)
    } else if (route.path.startsWith('/deals') && !route.path.startsWith('/deals/')) {
      groups['Deals (Legacy)'].push(route)
    } else if (route.path.startsWith('/deals/')) {
      groups['Deals (Legacy)'].push(route)
    } else if (route.path.startsWith('/finance-deals')) {
      groups['Finance Deals'].push(route)
    } else if (route.path.startsWith('/finance')) {
      groups['Finance (Cashboxes)'].push(route)
    } else if (route.path === '/exchange') {
      groups['Exchange (Client Exchange)'].push(route)
    } else if (route.path.startsWith('/exchange-deals')) {
      groups['Exchange Deals (Ghost - Deprecated)'].push(route)
    } else if (route.path.startsWith('/hr')) {
      groups['HR'].push(route)
    } else if (route.path.startsWith('/settings')) {
      groups['Settings'].push(route)
    } else if (route.path.startsWith('/stock')) {
      groups['Stock Management'].push(route)
    }
  })

  // Remove empty groups
  Object.keys(groups).forEach(key => {
    if (groups[key].length === 0) {
      delete groups[key]
    }
  })

  return groups
}

function generateMarkdown(routes: RouteInfo[]): string {
  const grouped = groupRoutes(routes)
  const totalRoutes = routes.length
  const activeRoutes = routes.filter(r => r.status === 'Used').length
  const ghostRoutes = routes.filter(r => r.status === 'Ghost').length

  let markdown = `# Application Routes

## Status Legend
- ✅ **Used** - Active route in production
- 👻 **Ghost** - Deprecated route (redirects or 404)
- 🚧 **WIP** - Work in progress
- 📝 **Planned** - Planned for future

## Routes Inventory

`

  Object.entries(grouped).forEach(([groupName, groupRoutes]) => {
    markdown += `### ${groupName}\n`
    markdown += `| Route | Status | Description |\n`
    markdown += `|-------|--------|-------------|\n`

    groupRoutes.forEach(route => {
      const statusIcon = route.status === 'Used' ? '✅' : route.status === 'Ghost' ? '👻' : '🚧'
      markdown += `| \`${route.path}\` | ${statusIcon} ${route.status} | ${route.description} |\n`
    })

    markdown += `\n`
  })

  markdown += `---

## Route Audit Log

**Last updated:** ${new Date().toISOString()}
**Total routes:** ${totalRoutes}
**Active routes:** ${activeRoutes}
**Ghost routes:** ${ghostRoutes}

## Notes

### Internal vs Client Exchange Separation
- \`/finance\` - Internal exchange operations (между своими кассами)
- \`/exchange\` - Client exchange operations (с контрагентами)
- Ghost routes \`/exchange-deals/*\` deprecated in favor of unified \`/exchange\` interface

### Route Naming Conventions
- Plural nouns for list pages: \`/contacts\`, \`/deals\`, \`/assets\`
- \`[id]\` for detail pages: \`/contacts/[id]\`
- Nested resources: \`/cars/clients/[id]\`
- Action pages with descriptive names: \`/cars/stock\`, \`/exchange-deals/new\`
`

  return markdown
}

function main() {
  console.log('🔍 Scanning for page.tsx files...')
  
  const appDir = path.join(process.cwd(), 'app')
  const pageFiles = findPageFiles(appDir)

  console.log(`✅ Found ${pageFiles.length} page files\n`)

  const routes: RouteInfo[] = pageFiles.map(filePath => {
    const route = filePathToRoute(filePath)
    const status = GHOST_ROUTES.includes(route) ? 'Ghost' : 'Used'
    const description = ROUTE_DESCRIPTIONS[route] || 'No description'

    return {
      path: route,
      filePath,
      status,
      description
    }
  })

  // Sort routes alphabetically
  routes.sort((a, b) => a.path.localeCompare(b.path))

  // Generate markdown
  const markdown = generateMarkdown(routes)

  // Write to ROUTES.md
  const routesPath = path.join(process.cwd(), 'ROUTES.md')
  fs.writeFileSync(routesPath, markdown, 'utf-8')

  console.log('📝 Routes inventory:')
  routes.forEach(route => {
    const icon = route.status === 'Used' ? '✅' : '👻'
    console.log(`  ${icon} ${route.path}`)
  })

  console.log(`\n✅ ROUTES.md updated successfully!`)
  console.log(`📊 Total: ${routes.length} routes`)
  console.log(`   Active: ${routes.filter(r => r.status === 'Used').length}`)
  console.log(`   Ghost: ${routes.filter(r => r.status === 'Ghost').length}`)
}

main()

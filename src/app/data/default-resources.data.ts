import { VoisResource } from '../models/vois-resource.model';

/**
 * Default (built-in) resources for the VOIS Resources page.
 * Separated from the component for maintainability and easy updates.
 */
export const DEFAULT_RESOURCES: VoisResource[] = [
  // ── Cloud & AWS ────────────────────────────────────────────
  {
    label: 'AWS Accounts',
    url: 'https://myapps.microsoft.com/signin/78f5464b-e016-4fdb-9478-ba285b87fb8e?tenantId=68283f3b-8487-4c86-adb3-a5228f18b893',
    type: 'link',
    category: 'Cloud & AWS',
    description: 'Sign in to AWS accounts via Microsoft MyApps',
  },
  {
    label: 'Cloud Engineering (Bastion) – int1 / qc1 / qc2 & lower',
    url: 'https://dx-team-services.vf-cep.engineering.vodafone.com/9f2fb151-e7b7-4b2e-ab9c-2c17d1db61d7/wfh/a33d1c35-b9da-4c17-a959-4bfa1f6ac4c1',
    type: 'link',
    category: 'Cloud & AWS',
    description: 'Bastion access for int1, qc1, qc2 and lower environments',
  },
  {
    label: 'Cloud Engineering – Home Page',
    url: 'https://dx-team-services.vf-cep.engineering.vodafone.com/9f2fb151-e7b7-4b2e-ab9c-2c17d1db61d7',
    type: 'link',
    category: 'Cloud & AWS',
    description: 'Cloud Engineering team services home page',
  },
  {
    label: 'Cloud Engineering – Whitelist',
    url: 'https://dx-team-services.vf-cep.engineering.vodafone.com/9f2fb151-e7b7-4b2e-ab9c-2c17d1db61d7/wfh/b22d8d86-2617-4bd8-99e9-0a2c250f26d6',
    type: 'link',
    category: 'Cloud & AWS',
    description: 'IP whitelist management for Cloud Engineering environments',
  },
  {
    label: 'Cloud Engineering (Bastion) – PAT1',
    url: 'https://dx-pat-team-services.vf-cep.engineering.vodafone.com/',
    type: 'link',
    category: 'Cloud & AWS',
    description: 'Bastion access for PAT1 environment',
  },
  {
    label: 'Cloud Engineering (Bastion) – PAT2 & PAT3',
    url: 'https://dx-ode-team-services.vf-cep.engineering.vodafone.com/',
    type: 'link',
    category: 'Cloud & AWS',
    description: 'Bastion access for PAT2 and PAT3 environments',
  },

  // ── Monitoring & Observability ─────────────────────────────
  {
    label: 'DataDog – Logs & APM',
    url: 'https://app.datadoghq.com/dashboard/cb7-pwh-78t?refresh_mode=sliding&from_ts=1741197275552&to_ts=1741200875552&live=true',
    type: 'link',
    category: 'Monitoring',
    description: 'Main DataDog dashboard for logs and application performance monitoring',
  },
  {
    label: 'DataDog – Containers',
    url: 'https://app.datadoghq.com/containers?_gl=1%2A63fe2t%2A_gcl_au%2AMzc1MDgyNTU3LjE3NTgxMTMzMTM.%2A_ga%2AMTM4MTMyMTMwNy4xNzU4MTEzMzE0%2A_ga_KN80RDFSQK%2AczE3NTgxMTMzMTYkbzEkZzAkdDE3NTgxMTMzMTYkajYwJGwwJGgxMDI0MDM4MTE.%2A_fplc%2AcUJ1Y2ZES3JoQW1iZmUyeXhyWkxpTTQ0RUhPRGFyaHdtUkYzTXZDdU9TJTJGbGw4OTJMSEtRZE95cEczVFlFTCUyRlpDdDd1SG9rdDF3VzdJTCUyRlNBQVNJYTN5azFTNlBHdHg5NmpCSE5penVrVXJXeHhmS3gzS3hYZlgxWWtYTCUyQkElM0QlM0Q.&selectedTopGraph=timeseries',
    type: 'link',
    category: 'Monitoring',
    description: 'DataDog container view for runtime inspection',
  },
  {
    label: 'PagerDuty – Production Incidents',
    url: 'https://vfuk.pagerduty.com/incidents',
    type: 'link',
    category: 'Monitoring',
    description: 'Active production incidents and on-call management',
  },
  {
    label: 'Splunk Executer',
    url: 'https://dublin.opsanalytics.vodafone.com/en-US/app/vf_uk_consumer_test/til_log_extractor?form.field4=*&form.field3.earliest=-24h%40h&form.field3.latest=now',
    type: 'link',
    category: 'Monitoring',
    description: 'Splunk log extractor for UK consumer test (last 24 hours)',
  },

  // ── Development ────────────────────────────────────────────
  {
    label: 'LaunchDarkly',
    url: 'https://app.launchdarkly.com',
    type: 'link',
    category: 'Development',
    description: 'Feature flag management',
  },
  {
    label: 'Swagger – mvax-api',
    url: 'https://mvax.dx-int1-common.digital.vodafoneaws.co.uk/app/swagger-ui/index.html#/',
    type: 'link',
    category: 'Development',
    description: 'Interactive API docs for mvax-api on int1',
  },
  {
    label: 'Figma',
    url: 'https://www.figma.com/design/ydrwPHKRLcMn1wTgGZ7C7x/MVA---Trade-in-Part-2--Xchange?node-id=6447-36224&p=f&t=HafrtsjUNBnWmKKZ-0',
    type: 'link',
    category: 'Development',
    description: 'MVA Trade-in Part 2 / Xchange design file',
  },
  {
    label: 'Web Login – int1',
    url: 'https://login-int1.dx-idm.vodafone.co.uk/login?ReturnUrl=%2Fconnect%2Fauthorize%2Fcallback%3Fclient_id%3Dmva-int1%26redirect_uri%3Dhttps%253A%252F%252Fmvax.vodafone.co.uk%252Fapp%252FdxidmCallback%26response_type%3Dcode%26scope%3Dopenid%2520vf-profile%2520vf-contact%2520vf-account%2520vf-subscription',
    type: 'link',
    category: 'Development',
    description: 'VFID login page for int1 environment',
  },

  // ── Documentation ──────────────────────────────────────────
  {
    label: 'Confluence – MVAX Architecture & Onboarding',
    url: 'https://confluence.sp.vodafone.com/display/AFUMV/MVAX+Architecture+Code+Onboarding',
    type: 'link',
    category: 'Documentation',
    description: 'Architecture overview and onboarding guide for new team members',
  },
  {
    label: 'Confluence – Locust PACE Setup',
    url: 'https://confluence.sp.vodafone.com/pages/viewpage.action?spaceKey=AFUMV&title=PACE+Environment+Setup',
    type: 'link',
    category: 'Documentation',
    description: 'Step-by-step PACE environment setup guide using Locust',
  },
  {
    label: 'Confluence – Types of Users',
    url: 'https://confluence.sp.vodafone.com/display/AFUMV/Types+of+Users',
    type: 'link',
    category: 'Documentation',
    description: 'Overview of different user types in MVAX',
  },
  {
    label: 'Confluence – Run PAT2 BAU',
    url: 'https://confluence.sp.vodafone.com/pages/viewpage.action?spaceKey=AFUMV&title=Pace+testing+using+PAT2',
    type: 'link',
    category: 'Documentation',
    description: 'How to run PACE testing using PAT2',
  },
  {
    label: 'Acronym Library',
    url: 'https://vodafone.sharepoint.com/teams/vbapps/AcronymLibrary/SitePages/dist/index.aspx',
    type: 'link',
    category: 'Documentation',
    description: 'Vodafone business acronym reference library',
  },
  {
    label: 'Teams Structure',
    url: 'https://dev.azure.com/vfuk-digital/Digital/_wiki/wikis/Digital%20X.wiki/2184/Team-Structure-and-contacts?anchor=core-engineering%3A-order-and-payments',
    type: 'link',
    category: 'Documentation',
    description: 'Azure DevOps wiki: team structure and contacts for Core Engineering (Order & Payments)',
  },

  // ── Environment ────────────────────────────────────────────
  {
    label: 'Environment Status & Reservation',
    url: 'https://scaling-dashboard.digital.vodafoneaws.co.uk/',
    type: 'link',
    category: 'Environment',
    description: 'Check environment availability and reserve slots (open Cloud Engineering Bastion link first)',
  },
  {
    label: 'Environment Schedule Sheet',
    url: 'https://vodafone.sharepoint.com/:x:/r/sites/MVAUK/_layouts/15/Doc.aspx?sourcedoc=%7B4853B7F9-845D-4440-879D-1071A16F5E15%7D&file=MVA%20Environment%20schedule%20.xlsx&action=default&mobileredirect=true',
    type: 'file',
    category: 'Environment',
    description: 'MVA environment booking schedule spreadsheet',
  },
  {
    label: 'PACE Dashboard',
    url: 'https://pace-reporting-dashboard.digital.vodafoneaws.co.uk/#/',
    type: 'link',
    category: 'Environment',
    description: 'Performance and capacity engineering reporting dashboard',
  },

  // ── Access & Requests ──────────────────────────────────────
  {
    label: 'ONE-UAM – Raise Requests',
    url: 'https://oneuam.vodafone.com/rc/one-rc/requests/templates%20oneUAM',
    type: 'link',
    category: 'Access & Requests',
    description: 'Vodafone unified access management — submit access requests',
  },
  {
    label: 'Access Requests – AWS Membership',
    url: 'https://vodafone.sharepoint.com/sites/TDO-UAM/Lists/Request%20%20AWS%20Membership%20Request/NewForm.aspx',
    type: 'link',
    category: 'Access & Requests',
    description: 'SharePoint form to request AWS membership access',
  },

  // ── HR & People ────────────────────────────────────────────
  {
    label: 'VOIS Benefits',
    url: 'https://voiseghrportal.vodafone.com/benefits',
    type: 'link',
    category: 'HR & People',
    description: 'Offers and medical insurance (requires VPN)',
  },
  {
    label: 'VOIS Facilities',
    url: 'https://vodafone.sharepoint.com/sites/VOISEGFacilitiesoperation',
    type: 'link',
    category: 'HR & People',
    description: 'GYM subscription, PlayStation reservations, and meditation room bookings',
  },
  {
    label: 'Attendance Lookup',
    url: 'https://apps.powerapps.com/play/e/30974ecd-6eb0-e491-8432-cfb9b0dcb849/a/bd7036d7-2812-4cd8-8e13-b1ee5a47c8a8?tenantId=68283f3b-8487-4c86-adb3-a5228f18b893',
    type: 'link',
    category: 'HR & People',
    description: 'View and manage attendance records',
  },
  {
    label: 'Training Tool',
    url: 'https://apps.powerapps.com/play/e/default-68283f3b-8487-4c86-adb3-a5228f18b893/a/b9ef3de9-1de0-4f80-816e-e2c9976037f1?tenantId=68283f3b-8487-4c86-adb3-a5228f18b893',
    type: 'link',
    category: 'HR & People',
    description: 'Quarterly training tracker — Q1: Apr–Jun, Q2: Jul–Sep, Q3: Oct–Dec, Q4: Jan–Mar',
  },
  {
    label: 'Team_Vacations.xlsx',
    url: 'https://apps.powerapps.com/play/e/default-68283f3b-8487-4c86-adb3-a5228f18b893/a/c0267a83-f06a-4223-9557-bf6fc69f663e',
    type: 'file',
    category: 'HR & People',
    description: 'Team vacation schedule spreadsheet',
  },

  // ── Content & CMS ─────────────────────────────────────────
  {
    label: 'Contentful – Content Entries',
    url: 'https://app.contentful.com/spaces/gbnnsauqav4t/views/entries?searchText=&contentTypeId=&contentTypeIds=&displayedFieldIds=contentType&displayedFieldIds=updatedAt&displayedFieldIds=author&order.fieldId=updatedAt&order.direction=descending&filters=',
    type: 'link',
    category: 'Content & CMS',
    description: 'Contentful CMS — browse and manage content entries',
  },

  // ── Onboarding ─────────────────────────────────────────────
  {
    label: 'MVA UK Business Walkthrough',
    url: 'https://vodafone.sharepoint.com/sites/MVAUK/Shared%20Documents/Forms/AllItems.aspx?id=%2fsites%2fMVAUK%2fShared+Documents%2fGeneral%2fOnboarding%2fBusiness+Walkthroughs&viewid=3f5174ff-679f-48f1-b280-7aa772588c9f',
    type: 'link',
    category: 'Onboarding',
    description: 'High-level business walkthrough for MVA UK — great starting point for new joiners',
  },
  {
    label: 'MVAX Architecture & Code Onboarding',
    url: 'https://confluence.sp.vodafone.com/display/AFUMV/MVAX+Architecture+Code+Onboarding',
    type: 'link',
    category: 'Onboarding',
    description: 'Confluence page covering MVAX architecture, codebase structure, and onboarding steps',
  },
  {
    label: 'MVAX Sessions – MW Onboarding',
    url: 'https://vodafone.sharepoint.com/sites/MVAUK/Shared%20Documents/Forms/AllItems.aspx?id=%2fsites%2fMVAUK%2fShared+Documents%2fGeneral%2fOnboarding%2fTechnical+Walkthroughs%2fMW+onboarding&viewid=3f5174ff-679f-48f1-b280-7aa772588c9f',
    type: 'link',
    category: 'Onboarding',
    description: 'Recorded onboarding sessions for the MW team',
  },
  {
    label: 'Development Environment Setup',
    url: 'https://confluence.sp.vodafone.com/display/AFUMV/Set-up+Environment',
    type: 'link',
    category: 'Onboarding',
    description: 'Step-by-step guide to set up your local development environment',
  },
  {
    label: 'Access Requests',
    url: 'https://confluence.sp.vodafone.com/display/AFUMV/Access+Requests',
    type: 'link',
    category: 'Onboarding',
    description: 'Request AWS account membership and environment access for new joiners',
  },
  {
    label: 'Code Repositories',
    url: 'https://confluence.sp.vodafone.com/display/AFUMV/MVAX+Architecture+Code+Onboarding#MVAXArchitectureCodeOnboarding-Coderepositories:',
    type: 'link',
    category: 'Onboarding',
    description: 'Azure DevOps — browse all MVAX source code repositories',
  },
  {
    label: 'MVAX Onboarding Assistant',
    url: 'https://m365.cloud.microsoft/apps/?templatedAppId=9e2962b8-7eae-4124-86f3-1799090725e1&templateInstanceId=247b2b9c-97be-43fd-8d8e-59a07b15dc6a&environment=Default-68283f3b-8487-4c86-adb3-a5228f18b893&source=embedded-builder',
    type: 'link',
    category: 'Onboarding',
    description: 'GitHub Copilot-powered MVAX onboarding agent — ask it anything about the codebase',
  },
];

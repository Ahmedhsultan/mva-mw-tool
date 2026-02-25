import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface VoisResource {
  label: string;
  description?: string;
  url?: string;
  type: 'link' | 'file';
  category: string;
}

@Component({
  selector: 'app-vois-resources',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vois-resources.component.html',
  styleUrl: './vois-resources.component.css',
})
export class VoisResourcesComponent {
  searchQuery = '';

  resources: VoisResource[] = [
    // ── Cloud & AWS ──
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

    // ── Monitoring & Observability ──
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

    // ── Development ──
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
    {
      label: 'Code Names',
      url: 'https://codenames.game/',
      type: 'link',
      category: 'Development',
      description: 'Online Codenames game for team activities',
    },

    // ── Documentation ──
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
      url: 'https://vodafone.sharepoint.com/teams/vbapps/AcronymLibrary/SitePages/dist/index.aspx?&xsdata=MDV8MDJ8fDRlM2MwN2QwZGRlNDQ4ZTk3MDczMDhkZDdhNzQ3MTczfDY4MjgzZjNiODQ4NzRjODZhZGIzYTUyMjhmMThiODkzfDB8MHw2Mzg4MDEzNjI2OTQ2NjQzMDd8VW5rbm93bnxWR1ZoYlhOVFpXTjFjbWwwZVZObGNuWnBZMlY4ZXlKV0lqb2lNQzR3TGpBd01EQWlMQ0pRSWpvaVYybHVNeklpTENKQlRpSTZJazkwYUdWeUlpd2lWMVFpT2pFeGZRPT18MXxMMk5vWVhSekx6RTVPakV6TkRaaE9XSXlaV0V6TXpRMU0yWmlNakEzTUdNNE56STVZamt3TkdNNVFIUm9jbVZoWkM1Mk1pOXRaWE56WVdkbGN5OHhOelEwTlRNNU5EWTVNamMxfDhkYmEwYzZmNGFmOTQyZmQ3MDczMDhkZDdhNzQ3MTczfDJjNDIzNzZiYjQ2NjRlOTI4N2MzMzQ4ODRjZGYxZjVi&sdata=TlhhTmlWc1BKKzhUOWFkUUJWcWpZU3lrOUtENUZzc0JteklQKzBaYlVUOD0%3D&ovuser=68283f3b-8487-4c86-adb3-a5228f18b893%2Chana.alaa%40vodafone.com&OR=Teams-HL&CT=1744632877285&clickparams=eyJBcHBOYW1lIjoiVGVhbXMtRGVza3RvcCIsIkFwcFZlcnNpb24iOiI1MC8yNTAzMTMyMTAxNCIsIkhhc0ZlZGVyYXRlZFVzZXIiOmZhbHNlfQ%3D%3D',
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

    // ── Environment ──
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

    // ── Access & Requests ──
    {
      label: 'ONE-UAM – Raise Requests',
      url: 'https://oneuam.vodafone.com/rc/one-rc/requests/templates%20oneUAM',
      type: 'link',
      category: 'Access & Requests',
      description: 'Vodafone unified access management — submit access requests',
    },
    {
      label: 'Access Requests – AWS Membership',
      url: 'https://vodafone.sharepoint.com/sites/TDO-UAM/Lists/Request%20%20AWS%20Membership%20Request/NewForm.aspx?Source=https%3A%2F%2Fvodafone.sharepoint.com%2Fsites%2FTDO-UAM%2FSitePages%2FThank-You.aspx&xsdata=MDV8MDJ8fDU2NzIyYTVjOTBiYzQ1M2EwYjg5MDhkZDU3MGFlOWFjfDY4MjgzZjNiODQ4NzRjODZhZGIzYTUyMjhmMThiODkzfDB8MHw2Mzg3NjI0MjY1MzgxMzQ0MDl8VW5rbm93bnxWR1ZoYlhOVFpXTjFjbWwwZVZObGNuWnBZMlY4ZXlKV0lqb2lNQzR3TGpBd01EQWlMQ0pRSWpvaVYybHVNeklpTENKQlRpSTZJazkwYUdWeUlpd2lWMVFpT2pFeGZRPT18MXxMMk5vWVhSekx6RTVPakpoWXpJMFlXVmlMV1ptTXprdE5ETXpaUzA1Wm1RNUxUZ3lZamN5TURNeU5UTmlObDgyTVdNNVkySTNNeTAxWVRrM0xUUXhPVFF0T0dWalpTMDFZMlV6TnpkbU5EUXhORGRBZFc1eExtZGliQzV6Y0dGalpYTXZiV1Z6YzJGblpYTXZNVGMwTURZME5UZ3pNVFF6TkE9PXxmNzIyNTNhODBiZDc0ZDBlMGI4OTA4ZGQ1NzBhZTlhY3xmMzY0OTAwZTUzNGU0ZjUwODc4YzA2MzU4OGQzM2IzZA%3D%3D&sdata=TUowOE9hRHIzMm0vM3U1RGVkVlhjeEdPbCtCd1RPU3Nrd1daekUwa2hyaz0%3D&ovuser=68283f3b-8487-4c86-adb3-a5228f18b893%2Chana.alaa%40vodafone.com&OR=Teams-HL&CT=1745754030436&clickparams=eyJBcHBOYW1lIjoiVGVhbXMtRGVza3RvcCIsIkFwcFZlcnNpb24iOiI1MC8yNTAzMTMyMTAxOCIsIkhhc0ZlZGVyYXRlZFVzZXIiOmZhbHNlfQ%3D%3D',
      type: 'link',
      category: 'Access & Requests',
      description: 'SharePoint form to request AWS membership access',
    },

    // ── HR & People ──
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
      url: 'https://apps.powerapps.com/play/e/30974ecd-6eb0-e491-8432-cfb9b0dcb849/a/bd7036d7-2812-4cd8-8e13-b1ee5a47c8a8?tenantId=68283f3b-8487-4c86-adb3-a5228f18b893&hint=574ee53e-2c9b-43be-99bc-962203b429c1&sourcetime=1754381646170',
      type: 'link',
      category: 'HR & People',
      description: 'View and manage attendance records',
    },
    {
      label: 'Training Tool',
      url: 'https://apps.powerapps.com/play/e/default-68283f3b-8487-4c86-adb3-a5228f18b893/a/b9ef3de9-1de0-4f80-816e-e2c9976037f1?tenantId=68283f3b-8487-4c86-adb3-a5228f18b893&hint=e46af588-fdb1-4bed-9aaa-512720bed364&sourcetime=1728735231483',
      type: 'link',
      category: 'HR & People',
      description: 'Quarterly training tracker — Q1: Apr–Jun, Q2: Jul–Sep, Q3: Oct–Dec, Q4: Jan–Mar',
    },
    {
      label: 'Team_Vacations.xlsx',
      url: "https://apps.powerapps.com/play/e/default-68283f3b-8487-4c86-adb3-a5228f18b893/a/c0267a83-f06a-4223-9557-bf6fc69f663e?source=teamsopenwebsite&screenColor=rgba(132%2C%2040%2C%2038%2C%201)&hint=b452848e-0619-4faa-b603-6d994f2053be&tenantId=68283f3b-8487-4c86-adb3-a5228f18b893",
      type: 'file',
      category: 'HR & People',
      description: 'Team vacation schedule spreadsheet',
    },

    // ── Contentful ──
    {
      label: 'Contentful – Content Entries',
      url: 'https://app.contentful.com/spaces/gbnnsauqav4t/views/entries?searchText=&contentTypeId=&contentTypeIds=&displayedFieldIds=contentType&displayedFieldIds=updatedAt&displayedFieldIds=author&order.fieldId=updatedAt&order.direction=descending&filters=',
      type: 'link',
      category: 'Content & CMS',
      description: 'Contentful CMS — browse and manage content entries',
    },

    // ── Onboarding ──
    {
      label: 'MVA UK Business Walkthrough',
      url: 'https://vodafone.sharepoint.com/sites/MVAUK/Shared%20Documents/Forms/AllItems.aspx?csf=1&web=1&e=IM29Tb&cid=7181fc97-0024-4e28-919d-02994d4c5991&FolderCTID=0x012000C90D57A9DED3F941B67C2DEFF6C4F90C&id=%2fsites%2fMVAUK%2fShared+Documents%2fGeneral%2fOnboarding%2fBusiness+Walkthroughs&viewid=3f5174ff-679f-48f1-b280-7aa772588c9f',
      type: 'link',
      category: 'Onboarding',
      description: 'High-level business walkthrough for MVA UK — great starting point for new joiners',
    },
    {
      label: 'MVAX Architecture & Code Onboarding',
      url: 'https://eur03.safelinks.protection.outlook.com/?url=https%3A%2F%2Fconfluence.sp.vodafone.com%2Fdisplay%2FAFUMV%2FMVAX%2BArchitecture%2BCode%2BOnboarding&data=05%7C02%7Cahmed.sultan1%40vodafone.com%7C92d66cd84ab34739adb308dd54131531%7C68283f3b84874c86adb3a5228f18b893%7C0%7C0%7C638759163124767746%7CUnknown%7CTWFpbGZsb3d8eyJFbXB0eU1hcGkiOnRydWUsIlYiOiIwLjAuMDAwMCIsIlAiOiJXaW4zMiIsIkFOIjoiTWFpbCIsIldUIjoyfQ%3D%3D%7C0%7C%7C%7C&sdata=4o%2FKSKsjITBA1OOpTH6jxQkiYov%2FLJS4xfBSjtOmdAo%3D&reserved=0',
      type: 'link',
      category: 'Onboarding',
      description: 'Confluence page covering MVAX architecture, codebase structure, and onboarding steps',
    },
    {
      label: 'MVAX Sessions – MW Onboarding',
      url: 'https://vodafone.sharepoint.com/sites/MVAUK/Shared%20Documents/Forms/AllItems.aspx?csf=1&web=1&e=IM29Tb&cid=7181fc97-0024-4e28-919d-02994d4c5991&FolderCTID=0x012000C90D57A9DED3F941B67C2DEFF6C4F90C&id=%2fsites%2fMVAUK%2fShared+Documents%2fGeneral%2fOnboarding%2fTechnical+Walkthroughs%2fMW+onboarding&viewid=3f5174ff-679f-48f1-b280-7aa772588c9f',
      type: 'link',
      category: 'Onboarding',
      description: 'Recorded onboarding sessions for the MW team',
    },
    {
      label: 'Development Environment Setup',
      url: 'https://eur03.safelinks.protection.outlook.com/?url=https%3A%2F%2Fconfluence.sp.vodafone.com%2Fdisplay%2FAFUMV%2FSet-up%2BEnvironment&data=05%7C02%7Cahmed.sultan1%40vodafone.com%7C92d66cd84ab34739adb308dd54131531%7C68283f3b84874c86adb3a5228f18b893%7C0%7C0%7C638759163124789098%7CUnknown%7CTWFpbGZsb3d8eyJFbXB0eU1hcGkiOnRydWUsIlYiOiIwLjAuMDAwMCIsIlAiOiJXaW4zMiIsIkFOIjoiTWFpbCIsIldUIjoyfQ%3D%3D%7C0%7C%7C%7C&sdata=seTFSOZJk9qboNIes2wHW5BShQZhfiwp4QDoC3GXfaQ%3D&reserved=0',
      type: 'link',
      category: 'Onboarding',
      description: 'Step-by-step guide to set up your local development environment',
    },
    {
      label: 'Access Requests',
      url: 'https://eur03.safelinks.protection.outlook.com/?url=https%3A%2F%2Fconfluence.sp.vodafone.com%2Fdisplay%2FAFUMV%2FAccess%2BRequests&data=05%7C02%7Cahmed.sultan1%40vodafone.com%7C92d66cd84ab34739adb308dd54131531%7C68283f3b84874c86adb3a5228f18b893%7C0%7C0%7C638759163124799922%7CUnknown%7CTWFpbGZsb3d8eyJFbXB0eU1hcGkiOnRydWUsIlYiOiIwLjAuMDAwMCIsIlAiOiJXaW4zMiIsIkFOIjoiTWFpbCIsIldUIjoyfQ%3D%3D%7C0%7C%7C%7C&sdata=aEZAEsYA1yzCDd2CTX4oVFf3oHKmcd0txCDDkE%2BeWAw%3D&reserved=0',
      type: 'link',
      category: 'Onboarding',
      description: 'Request AWS account membership and environment access for new joiners',
    },
    {
      label: 'Code Repositories',
      url: 'https://eur03.safelinks.protection.outlook.com/?url=https%3A%2F%2Fconfluence.sp.vodafone.com%2Fdisplay%2FAFUMV%2FMVAX%2BArchitecture%2BCode%2BOnboarding%23MVAXArchitectureCodeOnboarding-Coderepositories%3A&data=05%7C02%7Cahmed.sultan1%40vodafone.com%7C92d66cd84ab34739adb308dd54131531%7C68283f3b84874c86adb3a5228f18b893%7C0%7C0%7C638759163124810566%7CUnknown%7CTWFpbGZsb3d8eyJFbXB0eU1hcGkiOnRydWUsIlYiOiIwLjAuMDAwMCIsIlAiOiJXaW4zMiIsIkFOIjoiTWFpbCIsIldUIjoyfQ%3D%3D%7C0%7C%7C%7C&sdata=RMwWG27ivlKi2NdZ%2FVanRmaHNOFCIe4LQTGktpEkpK0%3D&reserved=0',
      type: 'link',
      category: 'Onboarding',
      description: 'Azure DevOps — browse all MVAX source code repositories',
    },
    {
      label: 'MVAX Onboarding Assistant',
      url: 'https://eur03.safelinks.protection.outlook.com/?url=https%3A%2F%2Fm365.cloud.microsoft%2Fapps%2F%3FtemplatedAppId%3D9e2962b8-7eae-4124-86f3-1799090725e1%26templateInstanceId%3D247b2b9c-97be-43fd-8d8e-59a07b15dc6a%26environment%3DDefault-68283f3b-8487-4c86-adb3-a5228f18b893%26source%3Dembedded-builder&data=05%7C02%7Cahmed.sultan1%40vodafone.com%7C92d66cd84ab34739adb308dd54131531%7C68283f3b84874c86adb3a5228f18b893%7C0%7C0%7C638759163124829086%7CUnknown%7CTWFpbGZsb3d8eyJFbXB0eU1hcGkiOnRydWUsIlYiOiIwLjAuMDAwMCIsIlAiOiJXaW4zMiIsIkFOIjoiTWFpbCIsIldUIjoyfQ%3D%3D%7C0%7C%7C%7C&sdata=PcGzoqbyV%2B5D%2BrL8Urvr9kygcH9ZNvh%2B%2BPV5nVb2LjA%3D&reserved=0',
      type: 'link',
      category: 'Onboarding',
      description: 'GitHub Copilot-powered MVAX onboarding agent — ask it anything about the codebase',
    },
  ];

  get categories(): string[] {
    const cats = [...new Set(this.filteredResources.map(r => r.category))];
    return cats.sort();
  }

  get filteredResources(): VoisResource[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.resources;
    return this.resources.filter(
      r =>
        r.label.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
    );
  }

  resourcesByCategory(category: string): VoisResource[] {
    return this.filteredResources.filter(r => r.category === category);
  }

  trackByLabel(_: number, r: VoisResource) {
    return r.label;
  }

  getFileIcon(label: string): string {
    const ext = label.split('.').pop()?.toLowerCase() ?? '';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return 'spreadsheet';
    if (['docx', 'doc'].includes(ext)) return 'doc';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['pptx', 'ppt'].includes(ext)) return 'ppt';
    return 'generic';
  }
}

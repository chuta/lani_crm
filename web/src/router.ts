import { createRouter, createWebHistory } from 'vue-router'
import IntakeForm from './pages/IntakeForm.vue'
import PipelineRegister from './pages/PipelineRegister.vue'
import ExecutiveView from './pages/ExecutiveView.vue'
import ArchetypeLibrary from './pages/ArchetypeLibrary.vue'
import DealDetail from './pages/DealDetail.vue'
import ProposalsDashboard from './pages/ProposalsDashboard.vue'
import ProposalDetail from './pages/ProposalDetail.vue'
import ClaimsLibrary from './pages/ClaimsLibrary.vue'
import BDProspectingTracker from './pages/BDProspectingTracker.vue'

const routes = [
  { path: '/', redirect: '/pipeline' },
  { path: '/intake', name: 'Intake', component: IntakeForm },
  { path: '/pipeline', name: 'Pipeline', component: PipelineRegister },
  { path: '/executive', name: 'Executive', component: ExecutiveView },
  { path: '/archetypes', name: 'Archetypes', component: ArchetypeLibrary },
  { path: '/deals/:id', name: 'DealDetail', component: DealDetail, props: true },
  // CPO routes
  { path: '/proposals', name: 'ProposalsDashboard', component: ProposalsDashboard },
  { path: '/proposals/:id', name: 'ProposalDetail', component: ProposalDetail, props: true },
  { path: '/claims-library', name: 'ClaimsLibrary', component: ClaimsLibrary },
  { path: '/prospecting', name: 'Prospecting', component: BDProspectingTracker },
]

const router = createRouter({
  history: createWebHistory('/partnerships/'),
  routes,
})

export default router
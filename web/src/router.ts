import { createRouter, createWebHistory } from 'vue-router'
import IntakeForm from './pages/IntakeForm.vue'
import PipelineRegister from './pages/PipelineRegister.vue'
import ExecutiveView from './pages/ExecutiveView.vue'
import ArchetypeLibrary from './pages/ArchetypeLibrary.vue'
import DealDetail from './pages/DealDetail.vue'
import AccountMap from './pages/AccountMap.vue'
import Ecosystem from './pages/Ecosystem.vue'
import Login from './pages/Login.vue'
import Signup from './pages/Signup.vue'
import AuthCallback from './pages/AuthCallback.vue'
import PendingApproval from './pages/PendingApproval.vue'
import UserAdmin from './pages/UserAdmin.vue'
import { useAuth } from './lib/auth'

const routes = [
  { path: '/login', name: 'Login', component: Login, meta: { public: true } },
  { path: '/signup', name: 'Signup', component: Signup, meta: { public: true } },
  { path: '/auth/callback', name: 'AuthCallback', component: AuthCallback, meta: { public: true } },
  { path: '/pending', name: 'Pending', component: PendingApproval, meta: { pending: true } },
  { path: '/', redirect: '/accounts' },
  { path: '/accounts', name: 'AccountMap', component: AccountMap },
  { path: '/ecosystem', name: 'Ecosystem', component: Ecosystem },
  { path: '/intake', name: 'Intake', component: IntakeForm },
  { path: '/pipeline', name: 'Pipeline', component: PipelineRegister },
  { path: '/executive', name: 'Executive', component: ExecutiveView },
  { path: '/archetypes', name: 'Archetypes', component: ArchetypeLibrary },
  { path: '/deals/:id', name: 'DealDetail', component: DealDetail, props: true },
  { path: '/proposals', redirect: '/accounts' },
  { path: '/proposals/:id', redirect: '/accounts' },
  { path: '/claims-library', redirect: '/accounts' },
  { path: '/prospecting', redirect: '/accounts' },
  { path: '/users', name: 'Users', component: UserAdmin, meta: { admin: true } },
]

const router = createRouter({
  history: createWebHistory('/partnerships/'),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuth()
  if (to.meta.public) {
    if (to.name !== 'AuthCallback' && auth.session.value) {
      return { name: auth.isAppUser.value ? 'AccountMap' : 'Pending' }
    }
    return true
  }
  if (!auth.session.value) {
    return { name: 'Login', query: { return: to.fullPath } }
  }
  if (!auth.isAppUser.value) {
    return to.name === 'Pending' ? true : { name: 'Pending' }
  }
  if (to.name === 'Pending') {
    return { name: 'AccountMap' }
  }
  if (to.meta.admin && !auth.isRootAdmin.value) {
    return { name: 'AccountMap' }
  }
  return true
})

export default router

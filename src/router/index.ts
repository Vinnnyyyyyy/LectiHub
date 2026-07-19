import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

function dashboardForRole(role: string | null) {
  if (role === 'admin') return '/admin'
  if (role === 'teacher') return '/teacher'
  if (role === 'student') return '/student'
  return '/login'
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/login',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminDashboard.vue'),
      meta: { requiresAuth: true, role: 'admin' },
    },
    {
      path: '/teacher',
      name: 'teacher',
      component: () => import('../views/TeacherDashboard.vue'),
      meta: { requiresAuth: true, role: 'teacher' },
    },
    {
      path: '/student',
      name: 'student',
      component: () => import('../views/StudentDashboard.vue'),
      meta: { requiresAuth: true, role: 'student' },
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth) {
    if (!authStore.token) {
      return next('/login')
    }
    if (to.meta.role && to.meta.role !== authStore.role) {
      return next(dashboardForRole(authStore.role))
    }
  }

  if (to.meta.guestOnly && authStore.token) {
    return next(dashboardForRole(authStore.role))
  }

  next()
})

export default router

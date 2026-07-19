import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/AboutView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
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

// Navigation guard: blocks access to protected routes if not logged in or wrong role
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  if (to.meta.requiresAuth) {
    if (!authStore.token) {
      return next('/login')
    }
    if (to.meta.role && to.meta.role !== authStore.role) {
      return next('/login') // logged in, but wrong role for this page
    }
  }

  next()
})

export default router

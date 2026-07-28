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
  scrollBehavior(to) {
    // Workspace panes scroll internally; only the standalone pages jump to top.
    if (to.matched.some((record) => record.meta.workspace)) return false
    return { top: 0 }
  },
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
      path: '/free-trial',
      name: 'free-trial',
      component: () => import('../views/FreeTrialView.vue'),
    },
    {
      path: '/admin',
      component: () => import('../views/admin/AdminShell.vue'),
      meta: { requiresAuth: true, role: 'admin', workspace: true },
      children: [
        { path: '', redirect: '/admin/timetable' },
        {
          path: 'timetable',
          name: 'admin-timetable',
          component: () => import('../views/admin/TimetableView.vue'),
          // Eyebrow and title are set live by the view (week range).
          meta: { title: 'Timetable' },
        },
        {
          path: 'overview',
          name: 'admin-overview',
          component: () => import('../views/admin/OverviewView.vue'),
          // Eyebrow and title are set live by the view (date + greeting).
          meta: { title: 'Overview' },
        },
        {
          path: 'requests',
          name: 'admin-requests',
          component: () => import('../views/admin/RequestsView.vue'),
          meta: {
            title: 'Review & assign',
            intro: 'Pending queue and past reviews — assign teachers, then revisit decisions.',
          },
        },
        {
          path: 'people',
          name: 'admin-people',
          component: () => import('../views/admin/PeopleView.vue'),
          // Eyebrow is set live by the view (teacher/student counts).
          meta: { title: 'People' },
        },
        {
          path: 'reports',
          name: 'admin-reports',
          component: () => import('../views/admin/ReportsView.vue'),
          // Eyebrow is set live by the view.
          meta: { title: 'Reports & feedback' },
        },
        {
          path: 'announcements',
          name: 'admin-announcements',
          component: () => import('../views/admin/AnnouncementsView.vue'),
          meta: { title: 'Inbox & alerts', intro: 'New scheduling requests and system alerts.' },
        },
        {
          path: 'payments',
          name: 'admin-payments',
          component: () => import('../views/admin/PaymentsView.vue'),
          meta: {
            title: 'Payments',
            intro: 'Student payment invoice receipts — record, confirm, or void.',
          },
        },
      ],
    },
    {
      path: '/teacher',
      component: () => import('../views/teacher/TeacherShell.vue'),
      meta: { requiresAuth: true, role: 'teacher', workspace: true },
      children: [
        { path: '', redirect: '/teacher/week' },
        {
          path: 'week',
          name: 'teacher-week',
          component: () => import('../views/teacher/WeekView.vue'),
          meta: {
            title: 'My teaching week',
            intro: 'Upcoming classes and assignment alerts.',
          },
        },
        {
          path: 'session',
          name: 'teacher-session',
          component: () => import('../views/teacher/SessionView.vue'),
          // Eyebrow and title are set live by the view (the class in session).
          meta: { title: 'In session' },
        },
        {
          path: 'report',
          name: 'teacher-report',
          component: () => import('../views/teacher/ReportView.vue'),
          meta: { title: 'Lesson report' },
        },
        {
          path: 'records',
          name: 'teacher-records',
          component: () => import('../views/teacher/RecordsView.vue'),
          // Eyebrow is set live by the view.
          meta: { title: 'Records' },
        },
        {
          path: 'hours',
          name: 'teacher-hours',
          component: () => import('../views/teacher/HoursView.vue'),
          meta: {
            title: 'Open hours & calendar',
            intro: 'Month and year view of your classes, plus weekly open hours for booking.',
          },
        },
      ],
    },
    {
      path: '/student',
      component: () => import('../views/student/StudentShell.vue'),
      meta: { requiresAuth: true, role: 'student', workspace: true },
      children: [
        { path: '', redirect: '/student/week' },
        {
          path: 'week',
          name: 'student-week',
          component: () => import('../views/student/WeekView.vue'),
          meta: {
            title: 'My week',
            intro: 'Join upcoming sessions and check alerts that need a look.',
          },
        },
        {
          path: 'book',
          name: 'student-book',
          component: () => import('../views/student/BookView.vue'),
          meta: {
            title: 'Book a class',
            intro: 'Pick preferred times and track confirmation from the center.',
          },
        },
        {
          path: 'calendar',
          name: 'student-calendar',
          component: () => import('../views/student/CalendarView.vue'),
          meta: {
            title: 'Calendar',
            intro: 'Month and year view of your classes, plus days teachers still have open.',
          },
        },
        {
          path: 'homework',
          name: 'student-homework',
          component: () => import('../views/student/HomeworkView.vue'),
          meta: {
            title: 'Homework & feedback',
            intro:
              'Use the sidebar to open pending feedback, lessons, reports, or archived history.',
          },
        },
        {
          path: 'payments',
          name: 'student-payments',
          component: () => import('../views/student/PaymentsView.vue'),
          meta: {
            title: 'Payments',
            intro: 'Submit a payment receipt for admin review and keep your invoice history here.',
          },
        },
      ],
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

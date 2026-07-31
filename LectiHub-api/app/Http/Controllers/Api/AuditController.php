<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class AuditController extends Controller
{
    private const CATEGORIES = ['scheduling', 'accounts', 'materials', 'announcements', 'settings'];

    private function mapEvent(AuditEvent $e): array
    {
        return [
            'id'          => $e->id,
            'category'    => $e->category,
            'action'      => $e->action,
            'description' => $e->description,
            'actorId'     => $e->actor_id,
            'actorName'   => $e->actor_name,
            'entityType'  => $e->entity_type,
            'entityId'    => $e->entity_id,
            'metadata'    => $e->metadata ?? [],
            'createdAt'   => $e->created_at,
        ];
    }

    /**
     * GET /admin/audit
     *
     * ?category=scheduling  ?days=7  ?actor=ava  ?search=worksheet  ?limit=100
     */
    public function listEvents(Request $request): JsonResponse
    {
        try {
            $query = AuditEvent::query()->orderByDesc('created_at');

            $category = strtolower(trim((string) $request->query('category', '')));
            if ($category && in_array($category, self::CATEGORIES, true)) {
                $query->where('category', $category);
            }

            $days = (int) $request->query('days', 0);
            if ($days > 0) {
                $query->where('created_at', '>=', now()->subDays($days));
            }

            $actor = trim((string) $request->query('actor', ''));
            if ($actor !== '') {
                $query->where('actor_name', 'like', '%' . $actor . '%');
            }

            $search = trim((string) $request->query('search', ''));
            if ($search !== '') {
                $query->where(function ($q) use ($search) {
                    $q->where('description', 'like', '%' . $search . '%')
                      ->orWhere('action', 'like', '%' . $search . '%');
                });
            }

            // Capped so a long-lived log cannot return unbounded rows.
            $limit = min(max((int) $request->query('limit', 200), 1), 500);

            $events = $query->limit($limit)->get();

            return response()->json([
                'events' => $events->map(fn (AuditEvent $e) => $this->mapEvent($e))->all(),
                'counts' => [
                    'total' => AuditEvent::count(),
                    'byCategory' => AuditEvent::selectRaw('category, COUNT(*) as c')
                        ->groupBy('category')
                        ->pluck('c', 'category'),
                ],
            ]);
        } catch (Throwable $e) {
            return response()->json(['message' => 'Unable to read the audit log.', 'error' => $e->getMessage()], 500);
        }
    }
}

#include "runtime.h"

typedef struct { int32_t id; } Node;
typedef struct { bool has_value; Node *value; int _pool_idx; } opt_ref_Node;
typedef struct { bool ok; union { opt_ref_Node value; TscError error; }; } Result_opt_ref_Node_TscError;

static Node _node_pool[4];
static uint8_t _node_pool_mask = 0;

static opt_ref_Node Node_alloc(void) {
    for (int _i = 0; _i < 4; _i++) {
        if (!(_node_pool_mask & ((uint8_t)1 << _i))) {
            _node_pool_mask |= ((uint8_t)1 << _i);
            return (opt_ref_Node){true, &_node_pool[_i], _i};
        }
    }
    return (opt_ref_Node){false, NULL, -1};
}

Result_opt_ref_Node_TscError make(void) {
    opt_ref_Node _pool_0 = Node_alloc();
    if (!_pool_0.has_value) {
        return (Result_opt_ref_Node_TscError){.ok = false, .error = (TscError){ .message = STR_LIT("pool exhausted: Node") }};
    }
    opt_ref_Node n = _pool_0;
    n.value->id = 1;
    return (Result_opt_ref_Node_TscError){.ok = true, .value = n};
}

int main(void) {
    TSC_INIT();
    return 0;
}

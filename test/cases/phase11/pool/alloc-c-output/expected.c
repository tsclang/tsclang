#include "runtime.h"

typedef struct { uint8_t id; } Token;
typedef struct { bool has_value; Token *value; int _pool_idx; } opt_ref_Token;

static Token _token_pool[2];
static uint8_t _token_pool_mask = 0;

static opt_ref_Token Token_alloc(void) {
    for (int _i = 0; _i < 2; _i++) {
        if (!(_token_pool_mask & (1 << _i))) {
            _token_pool_mask |= (1 << _i);
            return (opt_ref_Token){true, &_token_pool[_i], _i};
        }
    }
    return (opt_ref_Token){false, NULL, -1};
}

Result_opt_ref_Token_TscError make(void) {
    opt_ref_Token _pool_0 = Token_alloc();
    if (!_pool_0.has_value) {
        return (Result_opt_ref_Token_TscError){.ok = false, .error = Error_new(STR_LIT("pool exhausted: Token"))};
    }
    opt_ref_Token t = _pool_0;
    return (Result_opt_ref_Token_TscError){.ok = true, .value = t};
}

int main(void) {
    TSC_INIT();
    return 0;
}

#include "runtime.h"

typedef struct { uint8_t id; } Token;
static Token _token_pool[2];
static uint8_t _token_pool_mask = 0;

typedef struct { bool has_value; Token *value; int _pool_idx; } opt_ref_Token;

static opt_ref_Token Token_alloc(void) {
    for (int _i = 0; _i < 2; _i++) {
        if (!(_token_pool_mask & (1 << _i))) {
            _token_pool_mask |= (1 << _i);
            return (opt_ref_Token){true, &_token_pool[_i], _i};
        }
    }
    return (opt_ref_Token){false, NULL, -1};
}

int main(void) {
    TSC_INIT();
    opt_ref_Token t = Token_alloc();
    (void)t;
    return 0;
}

#include "runtime.h"

typedef struct { int32_t _state; String m; bool _done; String _value; } gen_state;
typedef struct { String value; bool done; } gen_result;

static gen_result gen_next(gen_state *self, String msg) {
    switch (self->_state) {
        case 0:
            self->m = msg;
            tsc_string_retain(&self->m);
            self->_state = 1;
            return (gen_result){self->m, false};
        case 1:
            goto _cleanup;
        _cleanup:
            tsc_string_release(&self->m);
            self->_done = true;
            return (gen_result){(String){0}, true};
    }
    return (gen_result){(String){0}, true};
}

int main(void) {
    TSC_INIT();
    gen_state g = {0};
    gen_result r1 = gen_next(&g, STR_LIT("ok"));
    printf("%s\n", r1.value.data);
    gen_result r2 = gen_next(&g, STR_LIT("ok"));
    String _tmp_0 = tsc_bool_to_string(r2.done);
    printf("%s\n", _tmp_0.data);
    tsc_string_release(_tmp_0);
    return 0;
}

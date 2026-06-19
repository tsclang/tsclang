#include "runtime.h"

typedef struct { int32_t _state; String name; bool _done; String _value; } greet_state;
typedef struct { String value; bool done; } greet_result;

static greet_result greet_next(greet_state *self, String prefix) {
    switch (self->_state) {
        case 0:
            self->name = prefix;
            tsc_string_retain(self->name);
            self->_state = 1;
            return (greet_result){self->name, false};
        case 1:
            goto _cleanup;
        _cleanup:
            tsc_string_release(self->name);
            self->_done = true;
            return (greet_result){(String){0}, true};
    }
    return (greet_result){(String){0}, true};
}

int main(void) {
    TSC_INIT();
    greet_state g = {0};
    greet_result r = greet_next(&g, STR_LIT("hi"));
    printf("%s\n", r.value.data);
    return 0;
}

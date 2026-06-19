#include "runtime.h"

typedef struct {
    int32_t _state; bool _done;
    Array_string arr;
} foo_state;
static String _arr_data_0[] = {STR_LIT("hello"), STR_LIT("world")};

static void foo_poll(foo_state *self) {
    switch (self->_state) {
        case 0:
            self->arr = (Array_string){.data = _arr_data_0, .length = 2, .capacity = 0};
            printf("%zu\n", self->arr.length);
            goto _cleanup;
        _cleanup:
            tsc_array_free_string(&self->arr);
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}

#include "runtime.h"

typedef struct { int32_t _state; bool _done; String _value; } multi_state;
typedef struct { String value; bool done; } multi_result;

static multi_result multi_next(multi_state *self) {
    switch (self->_state) {
        case 0:
            self->_state = 1;
            return (multi_result){STR_LIT("a"), false};
        case 1:
            self->_state = 2;
            return (multi_result){STR_LIT("b"), false};
        case 2:
            self->_state = 3;
            return (multi_result){STR_LIT("c"), false};
        case 3:
            self->_done = true;
            return (multi_result){(String){0}, true};
    }
    return (multi_result){(String){0}, true};
}

int main(void) {
    TSC_INIT();
    multi_state g = {0};
    multi_result _r_0 = multi_next(&g);
    printf("%s\n", _r_0.value.data);
    multi_result _r_1 = multi_next(&g);
    printf("%s\n", _r_1.value.data);
    multi_result _r_2 = multi_next(&g);
    printf("%s\n", _r_2.value.data);
    return 0;
}

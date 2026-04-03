#include "runtime.h"

typedef struct {
    int32_t _state;
    int _result;
    bool _done;
} main_state;

static void main_poll(main_state *self) {
    switch (self->_state) {
        case 0:
            printf("boot\n");
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    main_state _main_sm = {0};
    while (!_main_sm._done) {
        main_poll(&_main_sm);
    }
    return 0;
}

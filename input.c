#include "runtime.h"

static const int32_t x = 10;

typedef struct {
    int32_t _state;
    int _result;
    bool _done;
    int32_t t;
} run_state;

static void run_poll(run_state *self) {
    switch (self->_state) {
        case 0:
            self->t = /* expr:Spawn */;
            self->_done = true;
            return;
    }
}

int main(void) {
    TSC_INIT();
    return 0;
}

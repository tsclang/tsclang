#include "runtime.h"

typedef struct { void (*draw)(void *self); } Drawable_vtable;
typedef struct { void *self; const Drawable_vtable *vtable; } Drawable;

typedef struct { int _dummy; } Icon;

static void Icon_draw(const Icon *self) {
}

static const Drawable_vtable _Icon_Drawable_vtable = {
    .draw = (void (*)(void *))Icon_draw,
};

int main(void) {
    TSC_INIT();
    Icon icon = {0};
    Drawable d = {.self = &icon, .vtable = &_Icon_Drawable_vtable};
    return 0;
}
